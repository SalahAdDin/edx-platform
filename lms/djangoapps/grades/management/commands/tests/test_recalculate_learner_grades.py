"""
Tests for recalculate_learner_grades management command.
"""

from tempfile import NamedTemporaryFile

import mock

from lms.djangoapps.grades.management.commands import recalculate_learner_grades
from lms.djangoapps.grades.tests.test_tasks import HasCourseWithProblemsMixin
from xmodule.modulestore.tests.django_utils import ModuleStoreTestCase
from xmodule.modulestore.tests.factories import CourseFactory
from student.tests.factories import UserFactory, CourseEnrollmentFactory

DATE_FORMAT = "%Y-%m-%d %H:%M"


class TestRecalculateLearnerGrades(HasCourseWithProblemsMixin, ModuleStoreTestCase):
    """
    Tests recalculate learner grades management command.
    """

    def setUp(self):
        super(TestRecalculateLearnerGrades, self).setUp()
        self.command = recalculate_learner_grades.Command()

        self.course1 = CourseFactory.create()
        self.course2 = CourseFactory.create()
        self.course3 = CourseFactory.create()
        self.user1 = UserFactory.create()
        self.user2 = UserFactory.create()
        CourseEnrollmentFactory(course_id=self.course1.id, user=self.user1)
        CourseEnrollmentFactory(course_id=self.course1.id, user=self.user2)
        CourseEnrollmentFactory(course_id=self.course2.id, user=self.user1)
        CourseEnrollmentFactory(course_id=self.course2.id, user=self.user2)

        self.user_course_pairs = [
            (str(self.user1.id), str(self.course1.id)),
            (str(self.user1.id), str(self.course2.id)),
            (str(self.user2.id), str(self.course1.id)),
            (str(self.user2.id), str(self.course2.id))
        ]

    @mock.patch(
        'lms.djangoapps.grades.management.commands.recalculate_learner_grades.'
        'recalculate_course_and_subsection_grades_for_user'
    )
    def test_recalculate_grades(self, task_mock):
        with NamedTemporaryFile() as csv:
            csv.write("course_id,user_id\n")
            csv.writelines(course + "," + user + "\n" for user, course in self.user_course_pairs)
            csv.seek(0)

            self.command.handle(csv=csv.name)

            expected_calls = []
            for user, course in self.user_course_pairs:
                expected_calls.append(mock.call(
                    kwargs={
                        "user_id": user,
                        "course_key": course
                    }
                ))

            task_mock.apply_async.assert_has_calls(expected_calls, any_order=True)

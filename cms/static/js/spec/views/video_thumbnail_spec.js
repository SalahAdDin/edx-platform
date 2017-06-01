define(
    ['jquery', 'underscore', 'backbone', 'edx-ui-toolkit/js/utils/spec-helpers/ajax-helpers',
        'js/views/video_thumbnail', 'js/views/previous_video_upload_list', 'common/js/spec_helpers/template_helpers'],
    function($, _, Backbone, AjaxHelpers, VideoThumbnailView, PreviousVideoUploadListView, TemplateHelpers) {
        'use strict';
        describe('VideoThumbnailView', function() {
            var IMAGE_UPLOAD_URL = '/videos/upload/image',
                UPLOADED_IMAGE_URL = 'images/upload_success.jpg',
                VIDEO_IMAGE_MAX_BYTES = 2 * 1024 * 1024,
                VIDEO_IMAGE_MIN_BYTES = 2 * 1024,
                VIDEO_IMAGE_MAX_WIDTH = 1280,
                VIDEO_IMAGE_MAX_HEIGHT = 720,
                VIDEO_IMAGE_SUPPORTED_FILE_FORMATS = {
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.bmp': 'image/bmp',
                    '.bmp2': 'image/x-ms-bmp',   // PIL gives x-ms-bmp format
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg'
                },
                videoImageSettings = {
                    max_size: VIDEO_IMAGE_MAX_BYTES,
                    min_size: VIDEO_IMAGE_MIN_BYTES,
                    max_width: VIDEO_IMAGE_MAX_WIDTH,
                    max_height: VIDEO_IMAGE_MAX_HEIGHT,
                    supported_file_formats: VIDEO_IMAGE_SUPPORTED_FILE_FORMATS
                },
                defaultData = {
                    client_video_id: 'foo.mp4',
                    duration: 42,
                    created: '2014-11-25T23:13:05',
                    edx_video_id: 'dummy_id',
                    status: 'uploading',
                    thumbnail_url: null
                },
                videoThumbnailView,
                createVideoListView,
                createFakeImageFile,
                verifyStateInfo,
                render = function(modelData) {
                    videoThumbnailView = new VideoThumbnailView({
                        model: new Backbone.Model($.extend({}, defaultData, modelData)),
                        imageUploadURL: IMAGE_UPLOAD_URL,
                        videoImageSettings: videoImageSettings
                    });
                    return videoThumbnailView.render().$el;
                };


            createVideoListView = function(numVideos) {
                var numVideos = numVideos || 1,   // eslint-disable-line no-redeclare
                    collection = new Backbone.Collection(_.map(_.range(numVideos), function(num, index) {
                        return new Backbone.Model(_.extend({}, defaultData, {edx_video_id: 'dummy_id_' + index}));
                    }));
                return new PreviousVideoUploadListView({
                    collection: collection,
                    videoHandlerUrl: '/videos/course-v1:org.0+course_0+Run_0',
                    videoImageSettings: videoImageSettings
                });
            };


            createFakeImageFile = function(size, type) {
                var size = size || VIDEO_IMAGE_MIN_BYTES,   // eslint-disable-line no-redeclare
                    type = type || 'image/jpeg';    // eslint-disable-line no-redeclare
                return new Blob([Array(size + 1).join('i')], {type: type});
            };

            verifyStateInfo = function($thumbnail, state, onHover, additionalSRText) {
                var beforeIcon,
                    beforeText;

                // Verify hover message, save the text before hover to verify later
                if (onHover) {
                    beforeIcon = $thumbnail.find('.action-icon').html().trim();
                    beforeText = $thumbnail.find('.action-text').html().trim();
                    $thumbnail.trigger('mouseover');
                }

                if (additionalSRText) {
                    expect(
                        $thumbnail.find('.thumbnail-action .action-text-sr').text().trim()
                    ).toEqual(additionalSRText);
                }

                if (state !== 'error') {
                    expect($thumbnail.find('.action-icon').html().trim()).toEqual(
                         videoThumbnailView.actionsInfo[state].icon
                    );
                }

                expect($thumbnail.find('.action-text').html().trim()).toEqual(
                    videoThumbnailView.actionsInfo[state].text
                );

                // Verify if messages are restored after focus moved away
                if (onHover) {
                    $thumbnail.trigger('mouseout');
                    expect($thumbnail.find('.action-icon').html().trim()).toEqual(beforeIcon);
                    expect($thumbnail.find('.action-text').html().trim()).toEqual(beforeText);
                }
            };

            beforeEach(function() {
                setFixtures('<div id="page-prompt"></div><div id="page-notification"></div>');
                TemplateHelpers.installTemplate('video-thumbnail');
                TemplateHelpers.installTemplate('previous-video-upload-list');
            });

            it('renders as expected', function() {
                var $el = render({});
                expect($el.find('.thumbnail-wrapper')).toExist();
                expect($el.find('.upload-image-input')).toExist();
            });

            it('does not show duration if not available', function() {
                var $el = render({duration: 0});
                expect($el.find('.thumbnail-wrapper .video-duration')).not.toExist();
            });

            it('shows the duration if available', function() {
                var $el = render({}),
                    $duration = $el.find('.thumbnail-wrapper .video-duration');
                expect($duration).toExist();
                expect($duration.find('.duration-text-machine').text().trim()).toEqual('0:42');
                expect($duration.find('.duration-text-human').text().trim()).toEqual('Video duration is 42 seconds');
            });

            it('calculates duration correctly', function() {
                var durations = [
                        {duration: -1},
                        {duration: 0},
                        {duration: 0.75, machine: '0:00', humanize: ''},
                        {duration: 5, machine: '0:05', humanize: 'Video duration is 5 seconds'},
                        {duration: 103, machine: '1:43', humanize: 'Video duration is 1 minute and 43 seconds'},
                        {duration: 120, machine: '2:00', humanize: 'Video duration is 2 minutes'},
                        {duration: 500, machine: '8:20', humanize: 'Video duration is 8 minutes and 20 seconds'},
                        {duration: 7425, machine: '123:45', humanize: 'Video duration is 123 minutes and 45 seconds'}
                    ],
                    expectedDuration;

                durations.forEach(function(item) {
                    expectedDuration = videoThumbnailView.getDuration(item.duration);
                    if (item.duration <= 0) {
                        expect(expectedDuration).toEqual(null);
                    } else {
                        expect(expectedDuration.machine).toEqual(item.machine);
                        expect(expectedDuration.humanize).toEqual(item.humanize);
                    }
                });
            });

            it('can upload image', function() {
                var $el = render({}),
                    $thumbnail = $el.find('.thumbnail-wrapper'),
                    requests = AjaxHelpers.requests(this),
                    additionalSRText = videoThumbnailView.getSRText();

                videoThumbnailView.chooseFile();

                verifyStateInfo($thumbnail, 'upload');
                verifyStateInfo($thumbnail, 'requirements', true, additionalSRText);

                // Add image to upload queue and send POST request to upload image
                $el.find('.upload-image-input').fileupload('add', {files: [createFakeImageFile()]});

                verifyStateInfo($thumbnail, 'progress');

                // Verify if POST request received for image upload
                AjaxHelpers.expectRequest(requests, 'POST', IMAGE_UPLOAD_URL + '/dummy_id', new FormData());

                // Send successful upload response
                AjaxHelpers.respondWithJson(requests, {image_url: UPLOADED_IMAGE_URL});

                verifyStateInfo($thumbnail, 'edit', true);

                // Verify uploaded image src
                expect($thumbnail.find('img').attr('src')).toEqual(UPLOADED_IMAGE_URL);
            });

            it('shows error state correctly', function() {
                var $el = render({}),
                    $thumbnail = $el.find('.thumbnail-wrapper'),
                    requests = AjaxHelpers.requests(this);

                videoThumbnailView.chooseFile();

                // Add image to upload queue and send POST request to upload image
                $el.find('.upload-image-input').fileupload('add', {files: [createFakeImageFile()]});

                AjaxHelpers.respondWithError(requests, 400);

                verifyStateInfo($thumbnail, 'error');
            });

            it('calls readMessage with correct message', function() {
                var successData = {
                        files: [createFakeImageFile()],
                        submit: function() {}
                    },
                    failureData = {
                        jqXHR: {
                            responseText: JSON.stringify({
                                error: 'The selected image contains unsupported image file type.'
                            })
                        }
                    };

                // call render
                render({});
                spyOn(videoThumbnailView, 'readMessages');

                videoThumbnailView.imageSelected({}, successData);
                expect(videoThumbnailView.readMessages).toHaveBeenCalledWith(['Video image upload started']);
                videoThumbnailView.imageUploadSucceeded({}, {result: {image_url: UPLOADED_IMAGE_URL}});
                expect(videoThumbnailView.readMessages).toHaveBeenCalledWith(['Video image upload completed']);
                videoThumbnailView.imageUploadFailed({}, failureData);
                expect(videoThumbnailView.readMessages).toHaveBeenCalledWith(
                    ['Video image upload failed', 'The selected image contains unsupported image file type.']
                );
            });

            it('should show error message in case of server error', function() {
                var videoListView = createVideoListView(),
                    $videoListEl = videoListView.render().$el,
                    videoThumbnailView = videoListView.itemViews[0].videoThumbnailView, // eslint-disable-line no-shadow
                    $el = videoThumbnailView.render().$el,
                    requests = AjaxHelpers.requests(this);

                videoThumbnailView.chooseFile();

                // Add image to upload queue and send POST request to upload image
                $el.find('.upload-image-input').fileupload('add', {files: [createFakeImageFile()]});

                AjaxHelpers.respondWithError(requests);

                // Verify error message is present
                expect($videoListEl.find('.thumbnail-error-wrapper')).toExist();
            });

            it('should show error message when file is smaller than minimum size', function() {
                var errorMessage,
                    $thumbnailErrorEl,
                    videoListView = createVideoListView(),
                    $videoListEl = videoListView.render().$el,
                    videoThumbnailView = videoListView.itemViews[0].videoThumbnailView, // eslint-disable-line no-shadow
                    $el = videoThumbnailView.render().$el;

                videoThumbnailView.chooseFile();

                // Add image to upload queue and send POST request to upload image
                $el.find('.upload-image-input')
                    .fileupload('add', {files: [createFakeImageFile(VIDEO_IMAGE_MIN_BYTES - 10)]});

                errorMessage = 'The selected image must be larger than ' +
                    videoThumbnailView.getVideoImageMinSize().humanize + '.';
                // Verify error message
                $thumbnailErrorEl = $videoListEl.find('.thumbnail-error-wrapper');
                expect($thumbnailErrorEl.find('.action-text').html().trim()).toEqual(errorMessage);
            });

            it('should show error message when file is larger than maximum size', function() {
                var errorMessage,
                    $thumbnailErrorEl,
                    videoListView = createVideoListView(),
                    $videoListEl = videoListView.render().$el,
                    videoThumbnailView = videoListView.itemViews[0].videoThumbnailView, // eslint-disable-line no-shadow
                    $el = videoThumbnailView.render().$el;

                videoThumbnailView.chooseFile();

                // Add image to upload queue and send POST request to upload image
                $el.find('.upload-image-input')
                    .fileupload('add', {files: [createFakeImageFile(VIDEO_IMAGE_MAX_BYTES + 10)]});

                errorMessage = 'The selected image must be smaller than ' +
                    videoThumbnailView.getVideoImageMaxSize().humanize + '.';
                // Verify error message
                $thumbnailErrorEl = $videoListEl.find('.thumbnail-error-wrapper');
                expect($thumbnailErrorEl.find('.action-text').html().trim()).toEqual(errorMessage);
            });

            it('should not show error message when file is appropriate size', function() {
                var videoListView = createVideoListView(),
                    $videoListEl = videoListView.render().$el,
                    videoThumbnailView = videoListView.itemViews[0].videoThumbnailView, // eslint-disable-line no-shadow
                    $el = videoThumbnailView.render().$el;

                videoThumbnailView.chooseFile();

                // Add image to upload queue and send POST request to upload image
                $el.find('.upload-image-input')
                    .fileupload('add', {files: [createFakeImageFile(VIDEO_IMAGE_MIN_BYTES)]});

                // Verify error not present.
                expect($videoListEl.find('.thumbnail-error-wrapper')).not.toExist();
            });

            it('should show error message when file has unsupported content type', function() {
                var errorMessage,
                    $thumbnailErrorEl,
                    videoListView = createVideoListView(),
                    $videoListEl = videoListView.render().$el,
                    videoThumbnailView = videoListView.itemViews[0].videoThumbnailView, // eslint-disable-line no-shadow
                    $el = videoThumbnailView.render().$el;

                videoThumbnailView.chooseFile();

                // Add image to upload queue and send POST request to upload image
                $el.find('.upload-image-input')
                    .fileupload('add', {files: [createFakeImageFile(VIDEO_IMAGE_MIN_BYTES, 'mov/mp4')]});


                errorMessage = 'The selected image contains unsupported image file type. Supported file formats are ' +
                    videoThumbnailView.getVideoImageSupportedFileFormats().humanize + '.';
                // Verify error message
                $thumbnailErrorEl = $videoListEl.find('.thumbnail-error-wrapper');
                expect($thumbnailErrorEl.find('.action-text').html().trim()).toEqual(errorMessage);
            });

            it('should not show error message when file has supported content type', function() {
                var videoListView = createVideoListView(),
                    $videoListEl = videoListView.render().$el,
                    videoThumbnailView = videoListView.itemViews[0].videoThumbnailView, // eslint-disable-line no-shadow
                    $el = videoThumbnailView.render().$el;

                videoThumbnailView.chooseFile();

                // Add image to upload queue and send POST request to upload image
                $el.find('.upload-image-input')
                    .fileupload('add', {files: [createFakeImageFile(VIDEO_IMAGE_MIN_BYTES)]});

                // Verify error message is not present
                expect($videoListEl.find('.thumbnail-error-wrapper')).not.toExist();
            });
        });
    }
);

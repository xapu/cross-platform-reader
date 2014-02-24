/**
 * ReaderJS v1.0.0
 * (c) 2013 BlinkboxBooks
 * display.js: methods for create the container and display the content
 */

/* jshint unused: true */
/* exported Reader */
/* globals $, Bugsense */

var Reader = (function (r) {
	'use strict';

	var _initCFI = null, _initURL = null;

	// **Init function**
	//
	// Assign parameters to the global variables.
	//
	// * `param` Contains the parameters: container (id), chapters, padding, url, mobile, dimensions (width and height) etc.
	r.init = function(param) {
		r.reset(); // Reset the reader values.
		if (!param) { param = []; }
		// Take the params {container, chapters, width, height, padding, _mobile} or create them.
		r.$reader = param.hasOwnProperty('container') && $(param.container).length ? $(param.container) : $('<div id="reader_container"></div>').appendTo(document.body);
		r.$container = r.$reader.empty().wrap($('<div></div>')).parent().wrap($('<div id="' + (r.$reader[0].id + '_wrap') + '"></div>').css('display', 'inline-block'));

		r.$header = $('<div id="cpr-header"></div>').insertBefore(r.$container);
		r.$footer = $('<div id="cpr-footer"></div>').insertAfter(r.$container);

		// add styles and fonts
		_addStyles();

		r.listener = (param.hasOwnProperty('listener')) ? param.listener : null;

		r.DOCROOT = (param.hasOwnProperty('url')) ? param.url : r.DOCROOT;

		// Set the mobile flag.
		r.mobile = !!((param.hasOwnProperty('mobile')));

		// Save the initial bookmarks.
		r.Bookmarks.setBookmarks((param.hasOwnProperty('bookmarks')) ? param.bookmarks : [], true);

		// Set the initial position.
		_initCFI = param.hasOwnProperty('initCFI') ? param.initCFI : _initCFI;
		_initURL = param.hasOwnProperty('initURL') ? param.initURL : _initURL;

		// Resize the container with the width and height (if they exist).
		_createContainer(param.width, param.height, param.columns, param.padding);

		// Apply all user preferences
		r.setPreferences(param.preferences);

		r.resizeContainer(param);

		// Enable bugsense reporting
		_setBugsense();

		// Start the party.
		return loadInfo();
	};

	var _addStyles= function(){
		var $head = $('head');
		r.$stylesheet = $('<style id="cpr-stylesheet">' +
			'@@readerStyles'.replace(/#wrap_id/g, '#' + r.$reader.attr('id') + '_wrap').replace(/#id/g, '#' + r.$reader.attr('id')) +
			'</style>').appendTo($head);

		// Save a reference for each style
		var rules = r.$stylesheet[0].sheet.cssRules;
		var i= 0, l= rules.length, wrap_id = '#' + r.$reader.attr('id') + '_wrap', id = wrap_id + ' #' + r.$reader.attr('id');

		for(i=0; i< l; i++){
			var rule = rules[i];
			if(rule.selectorText === id +' *, '+id+' span, '+id+' p, '+id+' em, '+id+' div, '+id+' strong, '+id+' a, '+id+' h1, '+id+' h2, '+id+' h3, '+id+' h4, '+id+' h5, '+id+' h6'){
				r.preferences.lineHeight.rules.push({rule: rule.style, property: 'lineHeight'});
				r.preferences.fontSize.rules.push({rule: rule.style, property: 'fontSize'});
				r.preferences.fontFamily.rules.push({rule: rule.style, property: 'fontFamily'});
				r.preferences.textAlign.rules.push({rule: rule.style, property: 'textAlign'});
				r.preferences.theme.rules.color.push({rule: rule.style, property: 'color'});
			} else if(rule.selectorText === wrap_id){
				r.preferences.theme.rules.background.push({rule: rule.style, property: 'background'});
			} else if(rule.selectorText === '#cpr-header' || rule.selectorText === '#cpr-footer'){
				r.preferences.theme.rules.title.push({rule: rule.style, property: 'color'});
			} else if(rule.selectorText === '#cpr-bookmark-ui::before'){
				r.preferences.theme.rules.background.push({rule: rule.style, property: 'borderBackground'});
			}
		}

		// Note, this is injected regardless if it exists or not
		if(!r.mobile){
			$head.append('<link href=\'//fonts.googleapis.com/css?family=Droid+Serif:400,700,700italic,400italic\' rel=\'stylesheet\' type=\'text/css\'>');
		}
	};

	var _setBugsense = function(){
		if (typeof Bugsense === 'function') {
			r.Bugsense = new Bugsense({
				apiKey: 'f38df951',
				appName: 'CPR',
				appversion: '@@readerVersion'
			});
			// Setup error handler
			window.onerror = function (err) {
				r.Notify.error(err);
				return true;
			};
		}
	};

	// Check and load an URL if it is in the spine or the TOC.
	var _checkURL = function (url) {
		var findURL = false;
		// The URL.
		var u = url[0];
		// The anchor.
		var a = url[1];
		// Link is in the actual chapter.
		var chapter = r.Navigation.getChapter();
		if ((r.SPINE[chapter].href.indexOf(u) !== -1 || u === '') && a !=='') {
			r.Navigation.loadPage(r.moveToAnchor(a));
			return true;
		}
		// Check the table of contents...
		for (var i=0; i<r.TOC.length; i++) {
			if (r.TOC[i].href.indexOf(u) !== -1 && r.TOC[i].active === true) { findURL = true; }
		}

		var _load = function(j,a){
			r.Notify.event(r.Event.LOADING_STARTED);
			r.loadAnchor.apply(r, [j,a]).always(function clickLoadComplete(){
				r.Notify.event(r.Event.LOADING_COMPLETE);
			}).then(
				function clickLoadSuccess(){
					r.Notify.event($.extend({}, Reader.Event.getStatus(), {call: 'clickLoad'}));
				},
				function clickLoadError(err){
					r.Notify.error(err);
				}
			);
		};

		// Check the spine...
		for (var j=0; j<r.SPINE.length;j++) {
			// URL is in the Spine and it has a chapter number...
			if (r.SPINE[j].href.indexOf(u) !== -1) {
				r.Navigation.setChapter(j);
				r.Navigation.setPage(0);

				// since this is a user generated even, we must handle callbacks here
				_load(j,a);
				return true;
			}
		}
		return findURL;
	};

	var _touchTimer, _touchData = {
		call: 'userClick',
		clientX: null,
		clientY: null
	};

	// For mobile devices, notify the client of any touch events that happen on the reader (that are not links)
	var _touchStartHandler = function(e){
		if($(e.target).is(':not(a)')){
			_touchTimer = (new Date()).getTime();
			_touchData.clientX = e.touches ? e.touches[0].clientX : null;
			_touchData.clientY = e.touches ? e.touches[0].clientY : null;
		}
	};

	var _touchEndHandler = function(e){
		// if the difference between touchstart and touchend is smalller than 300ms, send the callback, otherwise it's a long touch event
		if((new Date()).getTime() - _touchTimer < 300 && $(e.target).is(':not(a)')){
			r.Notify.event($.extend({}, Reader.Event.UNHANDLED_TOUCH_EVENT, _touchData));
		}
	};

	// Capture all the links in the reader
	var _clickHandler = function (e) {
		e.preventDefault();
		if (this.getAttribute('data-link-type') === 'external') {
			// External link, notify client about it
			r.Notify.event($.extend({}, Reader.Event.NOTICE_EXT_LINK, {call: 'userClick', href:this.getAttribute('href')}));
		} else if (this.getAttribute('data-link-type') === 'internal') {
			// Internal link
			// Reduce the URL to the name file (remove anchors ids)
			var url = this.getAttribute('href').split('#');
			// Check if the link exists in the spine and ask the user
			if (!_checkURL(url)) {
				r.Notify.event($.extend({}, Reader.Event.CONTENT_NOT_AVAILABLE, {call: 'userClick'}));
			}
		}
		// Stop event propagation
		if (e.stopPropagation) { e.stopPropagation(); }
	};

	// Display HTML content
	//
	// * `param` Contains the parameters: content, page and mimetype
	// * `callback` Function to be called after the function's logic
	var displayContent = function(param) {
		var defer = $.Deferred();

		if (!param) { param = []; }
		// Take the params values
		var content = (param.hasOwnProperty('content')) ? param.content : '';
		var mimetype = (param.hasOwnProperty('mimetype')) ? param.mimetype : 'application/xhtml+xml';

		r.$header.text(r.bookTitle); // TODO Do not polute the reader object.
		// Parse the content according its mime-type
		content = r.parse(content, mimetype);
		r.$reader.html(content);

		// Wait for the images and build the container
		var $images = $('#' + r.$reader[0].id + ' img');
		var counter = 0, i = 0;
		var timer = setInterval(function () {

			if (counter >= $images.length) {
				clearInterval(timer);

				for (i = 0; i < $images.length; i++) {
					var $image = $($images[i]);
					// All images greater than 75% of the reader width will receive cpr-center class to center them
					if($image.width() > 3/4*(r.Layout.Reader.width / r.Layout.Reader.columns - r.Layout.Reader.padding / 2)){
						$image.addClass('cpr-center');
					}
				}

				_resizeImages();

				defer.resolve();
				return;
			}

			var tempCounter = 0;
			for (i = 0; i < $images.length; i++) {
				if ($images[i].complete === true) {
					tempCounter++;
				}
			}
			counter = tempCounter;
		}, 100);

		// Add all bookmarks for this chapter.
		var bookmarks = r.Bookmarks.getBookmarks()[r.Navigation.getChapter()];
		if(typeof(bookmarks) !== 'undefined'){
			$.each(bookmarks, function(index, bookmark){
				r.Navigation.setCFI(bookmark);
			});
		}

		return defer.promise();
	};

	// Define the container dimensions and create the multi column or adjust the height for the vertical scroll.
	//
	// * `width` In pixels
	// * `height` In pixels
	var _createContainer = function() {
		r.$reader.addClass(areColumnsSupported() ? 'columns' : 'scroll');

		r.$reader.css({
			position: 'relative',
			left: '0px',
			top: '0px'
		});

		// Container parent styles.
		r.$container
			.css({
				overflow: 'hidden'
			})
			.append('<span id="cpr-bookmark-ui"></span>');

		// Capture the anchor links into the content
		r.$container.on('click', 'a', _clickHandler);

		// Set touch handler for mobile clients, to send back the coordinates of the click
		if(r.mobile){
			document.removeEventListener('touchstart', _touchStartHandler);
			document.addEventListener('touchstart', _touchStartHandler);
			document.removeEventListener('touchend', _touchEndHandler);
			document.addEventListener('touchend', _touchEndHandler);
		}
	};

	r.resizeContainer = function(dimensions){
		// Save new values.
		r.Layout.Container.width = dimensions && dimensions.width ? Math.floor(dimensions.width) : r.Layout.Container.width;
		r.Layout.Container.height = dimensions && dimensions.height ? Math.floor(dimensions.height) : r.Layout.Container.height;
		r.Layout.Reader.width = r.Layout.Container.width - Math.floor(r.preferences.margin.value[1]*r.Layout.Container.width/100) - Math.floor(r.preferences.margin.value[3]*r.Layout.Container.width/100);
		r.Layout.Reader.height = r.Layout.Container.height - Math.floor(r.preferences.margin.value[0]*r.Layout.Container.height/100) - Math.floor(r.preferences.margin.value[2]*r.Layout.Container.height/100);
		r.Layout.Reader.columns = dimensions && dimensions.columns ? dimensions.columns : r.Layout.Reader.columns;
		r.Layout.Reader.padding = dimensions && dimensions.columns > 1 && dimensions.padding ? dimensions.padding : r.Layout.Reader.padding; // only set padding on multi-column layout

		// Apply new size
		r.$reader.css({
			left: '-' + ((Math.floor(r.Layout.Reader.width + r.Layout.Reader.padding)) * (r.Navigation.getPage())) + 'px',
			width: r.Layout.Reader.width + 'px',
			height: r.Layout.Reader.height + 'px',
			'column-width': Math.floor(r.Layout.Reader.width / r.Layout.Reader.columns - r.Layout.Reader.padding / 2) + 'px',
			'column-gap': r.Layout.Reader.padding + 'px',
			'column-fill': 'auto'
		});

		r.$container.css({
			width: r.Layout.Reader.width + 'px',
			height: r.Layout.Reader.height + 'px',
			'margin-left': Math.floor(r.preferences.margin.value[3] * r.Layout.Container.width/100) + 'px',
			'margin-right': Math.floor(r.preferences.margin.value[1] * r.Layout.Container.width/100) + 'px'
		});

		r.$header.css({
			width: r.Layout.Reader.width + 'px',
			'margin-left': Math.floor(r.preferences.margin.value[3] * r.Layout.Container.width/100) + 'px',
			'margin-right': Math.floor(r.preferences.margin.value[1] * r.Layout.Container.width/100) + 'px',
			'height': Math.floor(r.preferences.margin.value[0] * r.Layout.Container.height/100) + 'px',
			'line-height': Math.floor(r.preferences.margin.value[0] * r.Layout.Container.height/100) + 'px'
		});

		r.$footer.css({
			width: r.Layout.Reader.width + 'px',
			'margin-left': Math.floor(r.preferences.margin.value[3] * r.Layout.Container.width/100) + 'px',
			'margin-right': Math.floor(r.preferences.margin.value[1] * r.Layout.Container.width/100) + 'px',
			'height': Math.floor(r.preferences.margin.value[2] * r.Layout.Container.height/100) + 'px',
			'line-height': Math.floor(r.preferences.margin.value[2] * r.Layout.Container.height/100) + 'px'
		});

		_resizeImages();
		// Update navigation variables
		r.refreshLayout();
	};

	// Modifies some parameter related to the dimensions of the images and svg elements.
	// TODO Resize images based on column width, not just reader width
	var _resizeImages = function(){
		// Get SVG elements
		$('svg', r.$reader).each(function(index,node){
			// Calculate 95% of the width and height of the container.
			var width = (r.Layout.Reader.width - Math.floor(r.Layout.Reader.width*5/100));
			var height = r.Layout.Reader.height - Math.floor(r.Layout.Reader.height*5/100);
			// Modify SVG params when the dimensions are higher than the view space or they are set in % as this unit is not working in IE.
			if ((node.getAttribute('width') && (node.getAttribute('width') > r.Layout.Reader.width || node.getAttribute('width').indexOf('%') !== -1)) || !node.getAttribute('width')) {
				node.setAttribute('width', width);
			}
			if ((node.getAttribute('height') && (node.getAttribute('height') > r.Layout.Reader.height || node.getAttribute('height').indexOf('%') !== -1)) || !node.getAttribute('height')) {
				node.setAttribute('height', height);
			}
			// Modify the viewBox attribute if their dimensions are higher than the container.
			node.viewBox.baseVal.width = (node.viewBox.baseVal.width > r.Layout.Reader.width) ? width : node.viewBox.baseVal.width;
			node.viewBox.baseVal.height = (node.viewBox.baseVal.height > r.Layout.Reader.height) ? height : node.viewBox.baseVal.height;
			node.setAttribute('transform', 'scale(1)');
			// Modify children elements (images, rectangles, circles..) dimensions if they are higher than the container.
			$(this).children().map(function(){
				if ($(this).attr('width') > r.Layout.Reader.width) {
					$(this).attr('width', width);
				}
				if ($(this).attr('height') > r.Layout.Reader.height) {
					$(this).attr('height', height);
				}
			});
			if ($(this).find('path')) {
				// Fix path elements dimensions.
				var pathMaxWidth = 0;
				var pathMaxHeight = 0;
				// Take the highest width and height.
				$(this).find('path').each(function(){
					var pathWidth = $(this)[0].getBoundingClientRect().width;
					var pathHeight = $(this)[0].getBoundingClientRect().height;
					pathMaxWidth = (pathWidth > pathMaxWidth) ? pathWidth : pathMaxWidth;
					pathMaxHeight = (pathHeight > pathMaxHeight) ? pathHeight : pathMaxHeight;
				});
				if (pathMaxWidth > width || pathMaxHeight > height) {
					// Scale the elements to the correct proportion.
					var scale = Math.min(Math.floor((width/pathMaxWidth)*10)/10,Math.floor((height/pathMaxHeight)*10)/10);
					$(this).find('path').each(function(){
						$(this)[0].setAttribute('transform', 'scale(' + scale + ')');
					});
				}
			}
			// Remove SVG empty elements in some Webkit browsers is showing the content outside the SVG (Chrome).
			if ($(this).children().length === 0) {
				$(this).remove();
			}
		});
	};

	// Load the JSON file with all the information related to this book
	//
	// * `resource`
	var loadInfo = function() {
		var defer = $.Deferred();
		loadFile(r.INF, 'json').then(function bookInfoLoaded(data){
			r.SPINE = data.spine;
			r.TOC = data.toc;
			r.sample = data.sample;
			r.bookTitle = data.title;
			r.bookAuthor= data.author;

			// Check for startCFI, save it if and only if initCFI is null
			_initCFI = data.startCfi && !_initCFI ? data.startCfi : _initCFI;

			// If the OPF is in a folder...
			if (data.opfPath.indexOf('/') !== -1) {
				var pathComponents = data.opfPath.split('/');
				r.CONTENT_PATH_PREFIX = '';
				for (var i = 0; i < (pathComponents.length-1); i++){
					if (i !== 0) {
						r.CONTENT_PATH_PREFIX += '/';
					}
					r.CONTENT_PATH_PREFIX  += pathComponents[i];
				}
			}
			// If the PATH is empty set its value with the path of the first element in the spine.
			if (r.CONTENT_PATH_PREFIX === '') {
				// Check the path has more then one component.
				if (r.SPINE[0].href.indexOf('/') !== -1) {
					r.CONTENT_PATH_PREFIX = r.SPINE[0].href.split('/')[0];
				}
			}
			// Set OPF
			r.OPF = data.opfPath;
			if (r.OPF !== '') {
				loadFile(r.OPF).then(function opfFileLoaded(opf){
					r.opf = opf;

					var promise; // promise object to return
					if(_initCFI === null){
						// if initURL is null, load the first chapter, otherwise load the specified chapter
						promise = !!_initURL ? r.Navigation.loadChapter(_initURL) : r.loadChapter(0);
					} else {
						// load the chapter specified by the CFI, otherwise load chapter 0
						var chapter = r.CFI.getChapterFromCFI(_initCFI);
						promise = r.loadChapter(chapter !== -1 ? chapter : 0);
					}
					promise.then(r.Navigation.update).then(defer.resolve, defer.reject);
				}, defer.reject);
			}
			r.Navigation.setNumberOfChapters(data.spine.length); // Set number of chapters
		}, defer.reject);
		// notify client that info promise has been processed
		defer.notify();
		return defer.promise();
	};

	// Get a file from the server and display its content
	//
	// * `resource`
	// * `callback`
	var loadFile = function(resource, type) {
		var defer = $.Deferred();
		$.ajax({
			url: r.DOCROOT+'/'+resource,
			dataType: (type) ? type : 'text'
		}).then(defer.resolve, function(err){
				defer.reject($.extend({}, r.Event.ERR_MISSING_FILE, {details: err}));
			});
		return defer.promise();
	};

	// Load a chapter and go to the page pointed by the anchor value.
	r.loadAnchor = function(c,a){
		return r.loadChapter(c).then(function onLoadAnchorSuccess(){
			if (a) {
				var p = r.moveToAnchor(a);
				r.Navigation.loadPage(p);
				r.Navigation.update();
			} else {
				r.Navigation.loadPage(0);
				r.Navigation.update();
			}
		});
	};

	// Load a chapter with the index from the spine of this chapter
	r.loadChapter = function(chapterNumber) {
		var defer = $.Deferred();

		r.CFI.setUp(chapterNumber);
		r.Navigation.setChapter(chapterNumber);
		r.$reader.css('opacity', 0);

		// success handler for load chapter
		var loadChapterSuccess = function(data){
			displayContent({content: data}).then(function(){

				r.Navigation.setNumberOfPages();
				r.$reader.css('opacity', 1);

				// Go to init cfi, if it was set.
				if(_initCFI){
					r.CFI.goToCFI(_initCFI);
					_initCFI = null;
				}

				defer.resolve();
			}, defer.reject); // Execute the callback inside displayContent when its timer interval finish
		};

		// Check if the PATH is in the href value from the spine...
		if ((r.SPINE[chapterNumber].href.indexOf(r.CONTENT_PATH_PREFIX) !== -1)) {
			loadFile(r.SPINE[chapterNumber].href).then(loadChapterSuccess, defer.reject);
		} else {
			// If it is not, add it and load the chapter
			loadFile(r.CONTENT_PATH_PREFIX+'/'+r.SPINE[chapterNumber].href).then(loadChapterSuccess, defer.reject);
		}

		return defer.promise();
	};

	// Method to check if an URL has an extra path so it will be used for create a complete URL with relative paths.
	r.buildRelativeURL = function() {
		var chapter = r.Navigation.getChapter();
		var href = r.SPINE[chapter].href;
		var path = href.split('/');
		var relative = '';
		if (path.length > 2){
			for (var j = 1; j < (path.length-1); j++) {
				relative += path[j] + '/';
			}
		}
		return relative;
	};

	// Check if the browser supports css-columns.
	var areColumnsSupported = function () {
		var elemStyle = document.createElement('ch').style,
			domPrefixes = 'Webkit Moz O ms Khtml'.split(' '),
			prop = 'columnCount',
			uc_prop = prop.charAt(0).toUpperCase() + prop.substr(1),
			props   = (prop + ' ' + domPrefixes.join(uc_prop + ' ') + uc_prop).split(' ');

		for ( var i in props ) {
			if ( elemStyle[ props[i] ] !== undefined ) {
				return true;
			}
		}
		return false;
	};

	return r;

}(Reader || {}));

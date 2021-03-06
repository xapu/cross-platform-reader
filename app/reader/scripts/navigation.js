'use strict';

/* jshint unused: true */
/* exported Reader */
/* global $ */

var Reader = (function (r) {

	r.Book.spine = [];

	// Number of chapters.
	var bookChapters = 0;
	// Initial chapter by default.
	var chapter = 0;
	// Initial page by default.
	var page = 0;
	// Number of pages in the actual chapter (columns number).
	var pagesByChapter = 0;
	// The current location's CFI.
	var _cfi = null;

	// A reference to the head node of the current chapter:
	var _chapterHead = $();
	// The chapter document file name:
	var chapterDocName = '';

	// Reset method for the reader.
	// *Note, some properties are not reset, such as preferences, listeners, styling*.
	r.reset = function(){
		r.DOCROOT = '';
		r.mobile = false;

		// Reset all modules.
		r.Epub.reset();
		r.Navigation.reset();
		r.Bookmarks.reset();
		r.Highlights.reset();
		r.Book.reset();

		// Remove book content.
		if(r.$parent){
			r.$parent.empty();
			r.$iframe = null;
			r.$wrap = null;
			r.$head = null;
			r.$container = null;
			r.$reader = null;
			r.$header = null;
			r.$footer = null;
			r.$stylesheet = null;
			r.$overlay = null;

			// reset link to CSS rules
			r.preferences.lineHeight.rules = [];
			r.preferences.fontSize.rules = [];
			r.preferences.fontFamily.rules = [];
			r.preferences.textAlign.rules = [];
			r.preferences.theme.rules = {
				background: [],
				title: [],
				color: []
			};
		}
	};

	r.getReaderOuterWidth = function () {
		return Math.floor(r.Layout.Reader.width + r.Layout.Reader.padding);
	};

	r.getReaderLeftPosition = function () {
		// Transform value is matrix(a, c, b, d, tx, ty)
		return parseInt(r.$reader.css('transform').split(',')[4], 10) || 0;
	};

	r.setReaderLeftPosition = function (pos, duration) {
		var defer = $.Deferred();
		// Force any previous transition to finish.
		// Calling the r.getReaderLeftPosition() getter also seems to be necessary
		// for the next transitionend event in some cases (e.g. the transition unit tests).
		r.$reader.css({
			'transition-duration': '0s',
			transform: 'translateX(' + r.getReaderLeftPosition() + 'px)'
		}).trigger(r.support.transitionend);
		if (duration) {
			r.$reader.one(r.support.transitionend, defer.resolve);
		} else {
			defer.resolve();
		}
		r.$reader.css({
			'transition-duration': (duration || 0) + 's',
			transform: 'translateX(' + pos + 'px)'
		});
		return defer.promise();
	};

	// Return the page number in the actual chapter where it is an element.
	r.moveToAnchor = function (id) {
		// Find the obj
		var obj = $(r.document.getElementById(String(id)));
		if (obj.length === 0) {
			return 0; // If the object does not exist in the chapter we send the user to the page 0 of the chapter
		} else {
			// Check if the element has children and send the first one. This is to avoid the problems with big elements, like a wrapper for all the chapter.
			if (obj.children().length > 0) {
				return r.returnPageElement(obj.children().first());
			}
			return r.returnPageElement(obj);
		}
	};

	// Returns the page number related to an element.
	// [27.11.13] Refactored how we calculate the page for an element. Since the offset is calculated relative to the reader container now, we don't need to calculate the relative page number, only the absolute one.
	r.returnPageElement = function(obj) {
		obj = (obj instanceof $) ? obj : $(obj, $(r.document));
		if (!obj.length) {
			return -1;
		}
		var offset = obj.offset().left - r.$reader.offset().left;
		return Math.floor((offset) / r.getReaderOuterWidth());
	};

	var _getColumnsNumber = function() {
		var el = r.$reader[0];
		return Math.ceil(el.scrollWidth / r.getReaderOuterWidth());
	};

	// Refresh the content layout.
	r.refreshLayout = function(){
		// Update the number of columns
		pagesByChapter = _getColumnsNumber();
		var promise;
		// Maintain reader current position
		if(_cfi && _cfi.CFI) {
			promise = r.CFI.goToCFI(_cfi.CFI, true);
		} else {
			promise = $.Deferred().resolve().promise();
		}
		return promise.then(function () {
			r.Bookmarks.display();
			r.Highlights.display();
			r.Navigation.updateProgress();
		}, function (err) {
			r.Notify.error(err);
		});
	};

	// The current book progress.
	var _progress = 0;
	// The user reading speed in words per minute (WPM) as integer:
	var _readingSpeed = 250;
	// The remaining seconds to read the current chapter:
	var _remainingSecondsForChapter = 0;

	// ## Navigation API
	// The Navigation object exposes methods to allow the user to navigate within the book.
	//
	// * `save`
	// * `setNumberOfChapters`
	// * `getPage`
	// * `setPage`
	// * `loadPage`
	// * `setNumberOfPagesInChapter`
	// * `setChapter`
	// * `getChapter`
	// * `getChapterDocName`
	// * `loadChapter`
	// * `next`
	// * `prev`
	// * `getCFI`
	// * `getCFIObject`
	// * `setCFI`
	// * `reset`
	// * `getProgress`
	// * `updateProgress`
	// * `getCurrentCFI`
	// * `updateCurrentCFI`
	// * `update`

	r.Navigation = {
		save: function(){
			/* for(var k in sLoad) { oLoad[k]=sLoad[k]; } */
		},
		setNumberOfChapters: function(numberOfChapters) {
			bookChapters = numberOfChapters;
		},
		getNumberOfChapters: function(){
			return Chapter.getTotal();
		},
		getPage: function() {
			return Page.get();
		},
		getPagePosition: function() {
			return -1 * r.getReaderOuterWidth() * Page.get();
		},
		getNumberOfPages: function(){
			return Page.getByChapter();
		},
		setNumberOfPages: function(){
			// Update the number of columns
			pagesByChapter = _getColumnsNumber();
		},
		setPage: function(p) {
			Page.set(p);
		},
		loadPage: function(p, fixed) {
			return Page.load(p, fixed);
		},
		setChapter: function(c){

			chapter = c;
			// Update the chapter doc name.
			try {
				var pathComponents = r.Book.spine[chapter].href.split('/');
				// get the last element in the array
				chapterDocName = pathComponents.slice(-1)[0];
			}
			catch (e) {
				console.log('setChapter:'+e);
			}
		},
		getChapter: function(){
			return Chapter.get();
		},
		setChapterHead: function (head) {
			_chapterHead = head;
		},
		getChapterHead: function () {
			return _chapterHead;
		},
		getChapterDocName: function() {
			return Chapter.getDocName();
		},
		loadChapter: function (anchorUrl) {
			var spine = r.Book.spine,
					urlParts = anchorUrl.split('#'),
					url = urlParts[0],
					anchor = urlParts[1],
					index;
			if (anchor && (!url || spine[chapter].href.indexOf(url) === 0) &&
				!r.Navigation.isChapterPartAnchor(anchor)) {
				// URL points to current chapter (and chapter part)
				return r.Navigation.loadPage(anchor);
			}
			index = r.Book.getSpineIndex(url);
			if (index !== -1) {
				return r.loadChapter(index, anchor);
			}
			return $.Deferred().reject(
					$.extend({}, r.Event.ERR_INVALID_ARGUMENT, {details: 'Specified chapter does not exist.', call: 'loadChapter', href: anchorUrl})
			).promise();
		},
		next: function() {
			if (page < pagesByChapter - 1) {
				return Page.next();
			}
			var defer = $.Deferred(),
					chapterPartUrl = r.Navigation.getNextChapterPartUrl(),
					loadPromise;
			if (chapterPartUrl || chapter < bookChapters - 1) {
				defer.notify({type: 'chapter.loading'});
				r.Book.preloadFile(chapterPartUrl || r.Book.spine[chapter + 1].href);
				Page.moveTo(
					page + 1,
					r.preferences.transitionDuration.value
				).then(function () {
					if (chapterPartUrl) {
						loadPromise = r.Navigation.loadChapter(chapterPartUrl);
					} else {
						loadPromise = Chapter.load(Chapter.next());
					}
					loadPromise.then(defer.resolve, defer.reject);
				});
			} else {
				defer.reject(r.Event.END_OF_BOOK);
			}
			return defer.promise();
		},
		prev: function() {
			if (page > 0) {
				return Page.prev();
			}
			var defer = $.Deferred(),
					chapterPartUrl = r.Navigation.getPrevChapterPartUrl(),
					loadPromise;
			if (chapterPartUrl || chapter > 0) {
				defer.notify({type: 'chapter.loading'});
				r.Book.preloadFile(chapterPartUrl || r.Book.spine[chapter - 1].href);
				Page.moveTo(
					page - 1,
					r.preferences.transitionDuration.value
				).then(function () {
					if (chapterPartUrl) {
						loadPromise = r.Navigation.loadChapter(chapterPartUrl);
					} else {
						loadPromise = Chapter.load(Chapter.prev(), r.Navigation.getLastPageAnchorName());
					}
					loadPromise.then(defer.resolve, defer.reject);
				});
			} else {
				defer.reject(r.Event.START_OF_BOOK);
			}
			return defer.promise();
		},
		reset: function(){
			bookChapters = 0;
			chapter = 0;
			page = 0;
			pagesByChapter = 0;
			_cfi = null;
			_progress = 0;
		},
		getRemainingSecondsForChapter: function () {
			return _remainingSecondsForChapter;
		},
		updateRemainingSecondsForChapter: function (chapterWordCount, chapterReadFactor) {
			var wordsLeft = chapterWordCount * (1 - chapterReadFactor);
			var wordsPerSecond = _readingSpeed / 60;
			_remainingSecondsForChapter = Math.ceil(wordsLeft / wordsPerSecond);
		},
		getProgress: function(){
			return _progress;
		},
		updateProgress: function () {
			var totalWordCount = r.Book.getTotalWordCount(),
					spineItem = r.Book.spine.length && r.Book.spine[chapter],
					chapterWordCount = (spineItem && r.Book.getWordCount(spineItem)) || 0,
					chapterReadFactor = r.Navigation.getChapterReadFactor(),
					// Get the current word count from the chapter progress
					// (which adds one word to the number of words of previous chapters):
					currentWordCount = spineItem ? Math.round(spineItem.progress / 100 * totalWordCount - 1) : 0;

			// Estimate read word count from current chapter:
			currentWordCount += chapterWordCount * chapterReadFactor;

			r.Navigation.updateRemainingSecondsForChapter(chapterWordCount, chapterReadFactor);

			// Calculate progress.
			var progress = currentWordCount / totalWordCount * 100;
			// If the progress has a valid value (is a number) AND it is different than the current one, update it and send an event notification.
			if (progress !== _progress && !isNaN(progress)) {
				_progress = progress;
				// Send notification to all listeners that the progress has been updated
				// r.execEvent(r.Event.PROGRESS_UPDATED);
			}

			if (r.mobile) {
				// Update footer and display progress.
				var progressContainer = $('#cpr-progress', $(r.document));
				if (!progressContainer.length) {
					progressContainer = $('<div id="cpr-progress"></div>').appendTo(r.$footer);
				}
				progressContainer.text(Math.floor(_progress) + (r.sample ? ' % of sample' : ' % read'));
			}
		},
		goToProgress: function (progress) {
			var error;
			if ($.type(progress) !== 'number' || progress > 100 || progress < 0) {
				error = $.extend({}, r.Event.ERR_INVALID_ARGUMENT, {details: 'Invalid progress', value: progress, call: 'goToProgress'});
				r.Notify.error(error);
				return $.Deferred().reject(error).promise();
			}
			var targetWordCount = Math.ceil(progress / 100 * r.Book.getTotalWordCount()),
					wordCount = 0,
					progressFloat = 0,
					chapterWordCount,
					progressAnchor,
					i;
			for (i = 0; i < r.Book.spine.length; i++) {
				chapterWordCount = r.Book.getWordCount(r.Book.spine[i]);
				if (wordCount + chapterWordCount >= targetWordCount) {
					break;
				}
				wordCount += chapterWordCount;
			}
			if (chapterWordCount) {
				progressFloat = (targetWordCount - wordCount) / chapterWordCount;
			}
			progressAnchor = (progressFloat * 100) + '%';
			if (chapter !== i || !r.Navigation.isProgressInCurrentChapterPart(progressFloat)) {
				return r.loadChapter(i, progressAnchor);
			}
			return r.Navigation.loadPage(progressAnchor);
		},
		getCurrentCFI: function(){
			return _cfi;
		},
		updateCurrentCFI: function(){
			_cfi = r.CFI.getCFIObject();
		},
		update: function(){
			r.Navigation.updateCurrentCFI();
			r.Navigation.updateProgress();
			r.Bookmarks.display();
		},
		// Returns true for a progress anchor with a chapter percentage like e.g. "50%":
		isProgressAnchor: function (anchor) {
			return /%$/.test(anchor);
		},
		// Returns a floating point number from a percentage anchor, e.g. 0.5 for "50%":
		getProgressFromAnchor: function (anchor) {
			return Number(anchor.slice(0, -1)) / 100;
		},
		// Returns the page of the current chapter for the given percentage anchor:
		getProgressAnchorPage: function (anchor) {
			var progress = r.Navigation.getProgressFromAnchor(anchor),
					totalElements,
					readElements,
					partElements;
			if (r.Navigation.hasChapterParts()) {
				// Adjust the progress for the current chapter part:
				totalElements = r.Navigation.getNumberOfChapterPartsElements();
				readElements = r.Navigation.getCurrentChapterPart() * r.preferences.maxChapterElements.value;
				partElements = r.Navigation.getNumberOfChapterPartElements();
				progress = (progress * totalElements - readElements) / partElements;
			}
			return (Math.ceil(progress * pagesByChapter) || 1) - 1;
		},
		getLastPageAnchorName: function () {
			return 'cpr-lastpage';
		},
		isLastPageAnchor: function (anchor) {
			return /cpr-lastpage/.test(anchor);
		},
		getChapterPartAnchorPrefix: function () {
			return 'cpr-part';
		},
		isChapterPartAnchor: function (anchor) {
			return /^cpr-part/.test(anchor);
		},
		// Returns the number of removed elements from previous chapter parts:
		getPrevChapterPartMarker: function () {
			return r.$reader.find('#cpr-subchapter-prev');
		},
		// Returns the number of removed elements from previous chapter parts:
		getNextChapterPartMarker: function () {
			return r.$reader.find('#cpr-subchapter-next');
		},
		// Returns a collection of the available chapter part markers:
		getChapterPartMarkers: function () {
			return r.Navigation.getPrevChapterPartMarker().add(r.Navigation.getNextChapterPartMarker());
		},
		hasChapterParts: function () {
			return !!r.Navigation.getChapterPartMarkers().length;
		},
		// Returns the link to the next chapter part:
		getPrevChapterPartUrl: function () {
			return r.Navigation.getPrevChapterPartMarker().find('a').attr('href');
		},
		// Returns the link to the previous chapter part:
		getNextChapterPartUrl: function () {
			return r.Navigation.getNextChapterPartMarker().find('a').attr('href');
		},
		// Returns the zero based index of the current chapter part:
		getCurrentChapterPart: function () {
			return Number(r.Navigation.getChapterPartMarkers().attr('data-chapter-part')) || 0;
		},
		// Returns the number of parts the current chapter is split into:
		getNumberOfChapterParts: function () {
			return Number(r.Navigation.getChapterPartMarkers().attr('data-chapter-parts'));
		},
		// Returns the total number of elements counted for the chapter division calculation:
		getNumberOfChapterPartsElements: function () {
			return Number(r.Navigation.getChapterPartMarkers().attr('data-chapter-parts-elements'));
		},
		// Returns the number of elements counted for the current chapter part:
		getNumberOfChapterPartElements: function () {
			return Number(r.Navigation.getChapterPartMarkers().attr('data-chapter-part-elements')) || r.preferences.maxChapterElements.value;
		},
		// Returns true if the given floating point progress point is in the current chapter part:
		isProgressInCurrentChapterPart: function (progress) {
			return !r.Navigation.hasChapterParts() ||
				r.Navigation.getCurrentChapterPart() ===
					(Math.ceil(r.Navigation.getNumberOfChapterPartsElements() * progress / r.preferences.maxChapterElements.value) || 1) - 1;
		},
		// Returns the chapter part based on the given CFI:
		getChapterPartFromCFI: function (cfi) {
			var maxElements = r.preferences.maxChapterElements.value,
					part = 0;
			// Get the element path component of the cfi:
			// e.g. for epubcfi(/6/8!/4[body01]/2/402/2/1:0) get 4[body01]/2/402/2/1:0
			$.each((cfi.split('!')[1] || '').slice(1, -1).split('/'), function (key, value) {
				// Check if the CFI is found on a later chapter part by dividing the highest
				// branch count through the maxelements * 2 (CFI elements always have an even index):
				var newPart = Math.floor((parseInt(value, 10) - 1) / (maxElements * 2));
				if (newPart > 0) {
					part = newPart;
					// Break out of the $.each loop:
					return false;
				}
			});
			return part;
		},
		// Returns true if the given CFI can be found in the current chapter part:
		isCFIInCurrentChapterPart: function (cfi) {
			return !r.Navigation.hasChapterParts() || r.Navigation.getCurrentChapterPart() === r.Navigation.getChapterPartFromCFI(cfi);
		},
		// Calculate how much of the current chapter has been read:
		getChapterReadFactor: function () {
			var factor = (page + 1) / pagesByChapter,
					totalElements,
					readElements,
					partElements;
			if (r.Navigation.hasChapterParts()) {
				// Factor in the previous chapter parts, as pagesByChapter only counts the current chapter part:
				totalElements = r.Navigation.getNumberOfChapterPartsElements();
				readElements = r.Navigation.getCurrentChapterPart() * r.preferences.maxChapterElements.value;
				partElements = r.Navigation.getNumberOfChapterPartElements();
				return (readElements + partElements * factor) / totalElements;
			}
			return factor;
		}
	};

	// Returns images in the ideal loading order:
	function getImagesToLoad(reverse, nearestSelector) {
		// nearestSelector is the selector for the element identifying the current position,
		// e.g. a CFI marker as data attribute selector or an element id to identify an anchor in the current document:
		var nearestElement = nearestSelector && $(nearestSelector, r.$reader)[0],
				imgSelector = 'img.cpr-placeholder',
				// Both jQuery and the DOM selector API will return matching elements in DOM order.
				// Using this information, we combine the img selector with the nearestSelector:
				selector = nearestElement ? imgSelector + ',' + nearestSelector : imgSelector,
				// As a result, we will get a collection of elements with the CFI marker or anchor in the middle:
				images = $(selector, r.$reader),
				sortedImages,
				nearestIndex,
				i,
				el;
		// If the reverse argument is set, reverse the order of the elements,
		// which is useful for navigating backwards in a book:
		if (images.length > 1 && reverse) {
			images = $(images.get().reverse());
		}
		// If no position element is given, simply return the collected images:
		if (!nearestElement) {
			return images;
		}
		// Retrieve the index of the position element in the collection:
		nearestIndex = images.index(nearestElement);
		sortedImages = [];
		// Add the position element itself if it's matching the img selector:
		if ($(nearestElement).is(imgSelector)) {
			sortedImages.push(nearestElement);
		}
		// Add to the new collection starting with the images closest to the position element index:
		for (i = 1; sortedImages.length < images.length - 1; i++) {
			// Add the previous image before the position element:
			el = images[nearestIndex - i];
			if (el) {
				sortedImages.push(el);
			}
			// Add the next image after the position element:
			el = images[nearestIndex + i];
			if (el) {
				sortedImages.push(el);
			}
		}
		// Return the collection of img elements sorted based on their relative distance to the given element:
		return $(sortedImages);
	}

	// Loads images in sequential order based on the current chapter position:
	function loadImages(reverse, nearestSelector) {
		// A list to collect the images to be loaded:
		var updatedImages = $(),
				// Main deferred object, will be resolved once all the required images have been loaded:
				mainDefer = $.Deferred(),
				// Promise which will be used to chain the sequential image loading:
				promise = $.Deferred().resolve().promise();
		getImagesToLoad(reverse, nearestSelector).each(function () {
			var el = this,
					dataSrc = el && el.getAttribute('data-src');
			// Ignore images that have no data-src (safeguard, they should not be in the collection):
			if (!dataSrc) {
				return;
			}
			// Chaining the promises so we only load images until the nearest pages are filled.
			// Since each loaded image can influence the page layout we have to load them sequentially:
			promise = promise.then(function () {
				// Check if the img element is within the preload range:
				if (Math.abs(r.returnPageElement(el) - r.Navigation.getPage()) <= r.preferences.preloadRange.value) {
					var $el = $(el),
							defer = $.Deferred();
					$el.one('load', function () {
						// Remove all event handlers (load/error):
						$el.off();
						// Remove the placeholder class from the image element:
						$el.removeClass('cpr-placeholder');
						// All images greater than 75% of the reader width or height will receive cpr-img-large class to center them:
						var columnWidth = r.Layout.Reader.width / r.Layout.Reader.columns - r.Layout.Reader.padding / 2,
								columnHeight = r.Layout.Reader.height;
						if (el.width > 3/4 * columnWidth || el.height > 3/4 * columnHeight) {
							$el.addClass('cpr-img-large');
						} else  if(el.width > 1/4 * columnWidth || el.height > 1/4 * columnHeight){
							$el.addClass('cpr-img-medium');
						} else {
							$el.addClass('cpr-img-small');
						}
						// Notify on each image load:
						mainDefer.notify({type: 'img.load', element: el});
						updatedImages = updatedImages.add(el);
						// Resolve the promise for the current image:
						defer.resolve();
					});
					$el.one('error', function () {
						// Remove all event handlers (load/error):
						$el.off();
						// Restore the data-src to allow reloading the failed image:
						el.setAttribute('data-src', el.getAttribute('src'));
						// Restore the original src with the placeholder image:
						el.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
						// Resolve the promise for the current image:
						defer.resolve();
					});
					// Notify on each image loading start:
					mainDefer.notify({type: 'img.loading', element: el});
					// Start the image load by using the data-src for the actual img src:
					el.setAttribute('src', dataSrc);
					// Remove the obsolete data-src:
					el.removeAttribute('data-src');
					return defer.promise();
				}
			});
		});
		// This method is called after all the required images have been loaded:
		function resolveLoadImages() {
			r.Filters.removeFilter(afterChapterDisplayFilter);
			mainDefer.resolve(updatedImages);
		}
		// When a new chapter is displayed, it will remove the current images on the page
		// and might prevent any outstanding img load events and never resolve loadImages.
		// Therefore we call resolveLoadImages manually after the chapter content has been replaced:
		function afterChapterDisplayFilter (content) {
			resolveLoadImages();
			return content;
		}
		r.Filters.addFilter(r.Filters.HOOKS.AFTER_CHAPTER_DISPLAY, afterChapterDisplayFilter);
		promise.then(resolveLoadImages);
		return mainDefer.promise();
	}

	// ## Page API
	// Actual page is contained in the variable _pageIndex.
	//
	// * `get` returns the index of the actual page.
	// * `getByChapter` return the total number of pages in the actual chapter.
	// * `next` refreshes the page variable adding one and moves to the next page (column)
	// * `prev` refreshes the page variable subtracting one and moves to the prev pave (column)
	// * `load` refreshes the page variable with a value and moves the scroll to its position
	var Page = {
		set: function(p) {
			page = p;
		},
		get: function() {
			return page;
		},
		getByChapter: function() {
			return pagesByChapter;
		},
		// Moves to the page given as index, epubcfi, anchor or special last page anchor:
		moveTo: function (p, duration) {
			if ($.type(p) === 'string') {
				if (r.Navigation.isLastPageAnchor(p)) {
					// jump to the last page of the chapter:
					page = pagesByChapter - 1;
				} else if (r.Navigation.isProgressAnchor(p)) {
					// page is given as chapter progress, jump to the equivalent part:
					page = r.Navigation.getProgressAnchorPage(p);
				} else if (r.CFI.isValidCFI(p)) {
					// page is given as CFI, jump to the page containing the CFI marker:
					var pos = r.CFI.findCFIElement(p);
					page = pos === -1 ? 0 : pos;
				} else {
					// page is given as element id, jump to the page containing the element:
					page = r.moveToAnchor(p);
				}
			} else {
				page = p || 0;
			}
			return r.setReaderLeftPosition(-1 * r.getReaderOuterWidth() * page, duration);
		},
		next: function() {
			return Page.moveTo(
				page + 1,
				r.preferences.transitionDuration.value
			).then(function () {
				r.Navigation.updateCurrentCFI();
				return loadImages().then(function (updatedImages) {
					if (updatedImages.length) {
						r.refreshLayout();
					} else {
						r.Navigation.updateProgress();
						r.Bookmarks.display();
					}
				});
			});
		},
		prev: function() {
			return Page.moveTo(
				page - 1,
				r.preferences.transitionDuration.value
			).then(function () {
				var imgLoad;
				r.Navigation.updateCurrentCFI();
				return loadImages(true)
					.progress(function (data) {
						if (!imgLoad && data.type === 'img.loading') {
							r.setReaderOpacity(0);
							imgLoad = true;
						} else if (data.type === 'img.load') {
							pagesByChapter = _getColumnsNumber();
							r.CFI.goToCFI(_cfi.CFI, true).fail(function (err) {
								r.Notify.error(err);
							});
						}
					})
					.then(function () {
						r.Navigation.updateProgress();
						r.Bookmarks.display();
						r.Highlights.display();
						if (imgLoad) {
							r.setReaderOpacity(1);
						}
					});
			});
		},
		load: function(p, fixed) {
			var isString = $.type(p) === 'string',
				isLastPage,
				isProgressAnchor,
				selector,
				cfi;
			if (isString) {
				isLastPage = r.Navigation.isLastPageAnchor(p);
				isProgressAnchor = !isLastPage && r.Navigation.isProgressAnchor(p);
				if (!isLastPage && !isProgressAnchor) {
					if (r.CFI.isValidCFI(p)) {
						selector = r.CFI.getCFISelector(p);
					} else {
						selector = p;
					}
				}
			}
			Page.moveTo(p);
			if (isProgressAnchor) {
				// If we have a progress anchor, load images based around the new position:
				cfi = r.CFI.getCFIObject();
				selector = cfi && r.CFI.getCFISelector(cfi.CFI);
			}
			var promise = loadImages(isLastPage, selector)
				.progress(function () {
					// Update the colums and page position on each image load:
					pagesByChapter = _getColumnsNumber();
					Page.moveTo(p);
				});
			if (!fixed) {
				promise = promise.then(function () {
					r.Navigation.update();
				});
			}
			return promise;
		}
	};

	// ## Chapter API
	// Chapters number is contained in the variable _bookChapters.
	// Chapter index is controlled with the _bookChapter variable.
	//
	// * `get` returns the index of the actual chapter (_bookChapter)
	// * `getTotal` returns the total number of pages in the actual chapter.
	// * `next` refresh the index variable adding one.
	// * `prev` refresh the index variable subtracting one.
	var Chapter = {
		get: function(callback) {
			if (callback && typeof(callback) === 'function') { callback(); }
			return chapter;
		},
		getDocName: function(callback) {
			if (callback && typeof(callback) === 'function') { callback(); }
			return chapterDocName;
		},
		getTotal: function(callback) {
			if (callback && typeof(callback) === 'function') { callback(); }
			return bookChapters;
		},
		next: function() {
			return ++chapter;
		},
		prev: function() {
			return --chapter;
		},
		load: function(c, p) {
			return r.loadChapter(c, p);
		}
	};

	return r;

}(Reader || {}));

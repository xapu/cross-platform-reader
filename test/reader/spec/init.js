'use strict';

describe('Initialisation', function() {
	var readerID = 'reader';

	it('should initialise library', function() {
		expect(READER).toBeDefined();
		expect(READER.init).toBeFunction();
		expect(READER.enableDebug).toBeFunction();
	});

	// expect reader to be initialised
	it('should initialise reader with default container', function() {
		expect($('#reader_container')).toNotExist();
		READER.init();
		expect($('#reader_container')).toExist();
		expect($('#reader_container')).toHaveReaderStructure();
	});

	it('should initialise reader on DOM element', function() {

		var $container = $('<div id="' + readerID + '"></div>').appendTo($('body'));

		READER.init({
			container: $container[0]
		});

		expect($container).toHaveReaderStructure();
	});

	it('should initialise reader with selector', function() {

		var $container = $('<div id="' + readerID + '"></div>').appendTo($('body'));

		READER.init({
			container: '#' + readerID
		});

		expect($container).toHaveReaderStructure();
	});

	it('should replace previous reader', function() {
		// create a reader
		READER.init();
		expect($('#reader_container')).toExist();

		var $container = $('<div id="'+readerID+'"></div>').appendTo($('body'));

		// replace the reader
		READER.init({
			container: '#' + readerID
		});

		expect($container).toHaveReaderStructure();
		expect($('#reader_container, #reader_container_wrap')).toNotExist();
	});

});
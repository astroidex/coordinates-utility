/*jslint browser: true, nomen: true*/
/*globals initDropdown, Mapbender, OpenLayers, Proj4js, _, jQuery*/

(function ($) {
    'use strict';

    $.widget("mapbender.mbCoordinatesUtility", {
        options: {
            target:    null
        },
        mapClickActive: false,

        isPopupDialog: false,

        callback:       null,

        mbMap:          null,
        highlightLayer: null,
        feature:        null,
        mapClickHandler: null,

        currentMapCoordinate: null,
        transformedCoordinate: null,
        lon: null,
        lat: null,

        DECIMAL_ANGULAR: 6,
        DECIMAL_METRIC: 2,
        STRING_SEPARATOR: ' ',

        /**
         * Widget constructor
         *
         * @private
         */
        _create: function () {
            var widget = this,
                options = widget.options;

            if (!Mapbender.checkTarget("mbCoordinatesUtility", options.target)) {
                return;
            }

            Mapbender.elementRegistry.onElementReady(options.target, $.proxy(widget._setup, widget));
        },

        /**
         * Setup widget
         *
         * @private
         */
        _setup: function () {
            this.mbMap = $("#" + this.options.target).data("mapbenderMbMap");
            this.highlightLayer = new OpenLayers.Layer.Vector();

            this.isPopUpDialog = !this.element.closest('.sidePane,.sideContent').length;

            this._initializeMissingSrsDefinitions(this.options.srsList);
            this._setupMapClickHandler();
            this._setupButtons();
            this._setupSrsDropdown();
            this._setupEventListeners();

            this._trigger('ready');
        },

        /**
         * Initialize srs definitions which are not set before and missing in Proj4js.defs array
         *
         * @param srsList
         * @private
         */
        _initializeMissingSrsDefinitions: function (srsList) {

            if (null === srsList || typeof srsList.length === "undefined") {
                return;
            }

            srsList.map(function (srs) {
                if (typeof Proj4js.defs[srs.name] === "undefined") {
                    Proj4js.defs[srs.name] = srs.definition;
                }
            });
        },

        /**
         * Setup widget buttons
         *
         * @private
         */
        _setupButtons: function () {
            var widget = this;

            $('.copyClipBoard', widget.element).on('click',  $.proxy(widget._copyToClipboard, widget));
            $('.center-map', widget.element).on('click',  $.proxy(widget._centerMap, widget));

            if (!widget.isPopUpDialog) {
                var coordinateSearchButton = $('.coordinate-search', this.element);

                coordinateSearchButton.on('click', function () {
                    var isActive = $(this).hasClass('active');

                    if (isActive) {
                        widget.deactivate();
                    } else {
                        widget.activate();
                    }
                });

                coordinateSearchButton.removeClass('hidden');
            }
        },

        /**
         * Setup map click handler
         *
         * @private
         */
        _setupMapClickHandler: function () {
            this.mapClickHandler = new OpenLayers.Handler.Click(
                this,
                { 'click': this._mapClick },
                { map: this.mbMap.map.olMap }
            );
            this.mapClickHandler.activate();
        },

        /**
         * Create SRS dropdown
         */
        _setupSrsDropdown: function () {
            var widget = this,
                dropdown = $('.srs', widget.element);

            if (dropdown.children().length === 0) {
                widget._createDropdownOptions(dropdown);
            }

            initDropdown.call($('.dropdown', widget.element));
        },

        /**
         * Create options for the dropdown
         *
         * @param {DOM} dropdown
         * @private
         */
        _createDropdownOptions: function (dropdown) {
            var widget = this,
                srsArray = (null === widget.options.srsList) ? [] : widget.options.srsList;

            if (widget.options.addMapSrsList) {
                widget._addMapSrsOptionsToDropodw(srsArray);
            }

            if (srsArray.length === 0) {
                Mapbender.error(Mapbender.trans("mb.coordinatesutility.widget.error.noSrs"));
                return;
            }

            srsArray.map(function (srs) {
                if (widget._isValidSRS(srs.name)) {
                    var title = (srs.title.length === 0)
                        ? srs.name
                        : srs.title;

                    dropdown.append($('<option></option>').val(srs.name).html(title));
                }
            });

            widget._setDefaultSelectedValue(dropdown);
        },

        /**
         * Check if SRS is valid
         *
         * @param srs
         * @returns {boolean}
         * @private
         */
        _isValidSRS: function (srs) {
            var projection = new OpenLayers.Projection(srs),
                isValid = true;

            if (typeof projection.proj.defData === 'undefined') {
                isValid = false;
            }

            return isValid;
        },

        /**
         * Add SRSs from the map
         *
         * @param array srsArray
         * @private
         */
        _addMapSrsOptionsToDropodw: function (srsArray) {
            var mapSrs = this.mbMap.getAllSrs();

            var srsNames = srsArray.map(function (srs) {
                return srs.name;
            });

            mapSrs.map(function (srs) {

                var srsAlreadyExists = $.inArray(srs.name, srsNames) >= 0;

                if (srsAlreadyExists === false) {
                    srsArray.push(srs);
                }
            });
        },

        /**
         * Set selected by default value in dropdown
         *
         * @param {DOM} dropdown
         * @private
         */
        _setDefaultSelectedValue: function (dropdown) {
            var currentSrs = this.mbMap.getModel().getCurrentProj();

            dropdown.val(currentSrs.projCode);
        },

        /**
         * Setup event listeners
         *
         * @private
         */
        _setupEventListeners: function () {
            var widget = this;

            $(document).on('mbmapsrschanged', $.proxy(widget._resetFields, widget));

            $('select.srs', widget.element).on('change', $.proxy(widget._transformCoordinateToSelectedSrs, widget));
            $('input.input-coordinate', widget.element).on('change', $.proxy(widget._transformCoordinateToMapSrs, widget));
        },

        /**
         * Popup HTML window
         *
         * @param html
         * @return {mapbender.mbLegend.popup}
         */
        popup: function () {
            var widget = this,
                element = widget.element;

            if (!widget.popupWindow || !widget.popupWindow.$element) {
                widget.popupWindow = new Mapbender.Popup2({
                    title:                  element.attr('title'),
                    draggable:              true,
                    resizable:              true,
                    modal:                  false,
                    closeButton:            false,
                    closeOnPopupCloseClick: true,
                    closeOnESC:             false,
                    destroyOnClose:         false,
                    detachOnClose:          false,
                    content:                this.element.removeClass('hidden'),
                    width:                  450,
                    height:                 400,
                    buttons:                {}
                });

                widget.popupWindow.$element.on('close', function () {
                    widget.close();
                });
            }

            widget.popupWindow.$element.removeClass('hidden');
        },

        /**
         * Provide default action (Button control)
         *
         * @returns {action}
         * @todo: remove this entire method, rely on button to find "open" method (conflict with Mapbender <v3.0.8-beta1)
         */
        defaultAction: function (callback) {
            if (!this.isPopUpDialog) {
                throw new Error("Invalid attempt to control non-popup element via legacy defaultAction");
            }
            if (!this.popupWindow || this.popupWindow.$element.hasClass('hidden')) {
                return this.open(callback);
            } else {
                this.close();
            }
        },

        /**
         * On open handler
         */
        open: function (callback) {
            this.callback = callback;

            this.popup();
            this.activate();
        },

        /**
         * On close
         */
        close: function () {
            if (this.popupWindow && this.popupWindow.$element) {
                this.popupWindow.$element.addClass('hidden');
            }
            if (this.callback) {
                this.callback.call();
                this.callback = null;
            }

            this.deactivate();
            this._resetFields();
        },

        /**
         * Activate coordinate search
         */
        activate: function () {
            this.mbMap.map.element.addClass('crosshair');
            this.mbMap.map.olMap.addLayer(this.highlightLayer);
            $('.coordinate-search', this.element).addClass('active');
            this.mapClickActive = true;
        },

        /**
         * Deactivate coordinate search
         */
        deactivate: function () {
            this.mbMap.map.element.removeClass('crosshair');
            this.mbMap.map.olMap.removeLayer(this.highlightLayer);
            $('.coordinate-search', this.element).removeClass('active');
            this.mapClickActive = false;
        },
        /**
         * New-style sidepane API: containing pane is visible
         */
        reveal: function() {
            this.activate();
            if (this.clickPoint) {
                this._showFeature();
            }
        },
        /**
         * New-style sidepane API: containing pane is hidden
         */
        hide: function() {
            this.deactivate();
            this._removeFeature();
        },

        /**
         * On map click handler
         *
         * @param e selected pixel
         * @private
         */
        _mapClick: function (e) {
            if (!this.mapClickActive) {
                return;
            }
            var lonlat = this.mbMap.map.olMap.getLonLatFromPixel(e.xy);
            this.clickPoint = new OpenLayers.Geometry.Point(lonlat.lon, lonlat.lat);

            this.currentMapCoordinate = this._formatOutputString(lonlat, e.object.units);

            this.lon = lonlat.lon;
            this.lat = lonlat.lat;

            this._transformCoordinates();
            this._updateFields();
        },

        /**
         * Transform coordinates to selected SRS
         *
         * @private
         */
        _transformCoordinates: function () {
            var selectedSrs = $('select.srs', this.element).val();

            if (null === this.lon || null === this.lat || null === selectedSrs) {
                return;
            }

            var currentProjection = this.mbMap.map.olMap.getProjectionObject(),
                projectionToTransform = new OpenLayers.Projection(selectedSrs);

            var lonlat = new OpenLayers.LonLat(this.lon, this.lat).transform(currentProjection, projectionToTransform);

            this.transformedCoordinate = this._formatOutputString(
                lonlat,
                projectionToTransform.proj.units
            );
        },

        /**
         * Format output coordinate string
         *
         * @param {OpenLayersPoint} point
         * @returns {string}
         * @private
         */
        _formatOutputString: function (point, unit) {
            var decimal = (unit  === 'm')
                ? this.DECIMAL_METRIC
                : this.DECIMAL_ANGULAR;

            return point.lon.toFixed(decimal) + this.STRING_SEPARATOR + point.lat.toFixed(decimal);
        },

        /**
         * Update coordinate input fields
         *
         * @private
         */
        _updateFields: function () {
            $('input.map-coordinate', this.element).val(this.currentMapCoordinate);
            $('input.input-coordinate', this.element).val(this.transformedCoordinate);

            this._showFeature();
        },

        /**
         * Reset coordinate input fields
         *
         * @private
         */
        _resetFields: function () {
            this.currentMapCoordinate = null;
            this.transformedCoordinate = null;

            this._updateFields();
            this._removeFeature();
        },

        /**
         * Show feature on the map
         *
         * @private
         */
        _showFeature: function () {
            this.feature = new OpenLayers.Feature.Vector(this.clickPoint);

            this.highlightLayer.removeAllFeatures();
            this.highlightLayer.addFeatures(this.feature);
        },

        /**
         * Remove feature from the map
         *
         * @private
         */
        _removeFeature: function () {
            if (this.feature) {
                this.highlightLayer.removeFeatures(this.feature);
            }
        },

        /**
         * Copy a coordinate to the buffer
         *
         * @param e
         * @private
         */
        _copyToClipboard: function (e) {
            $(e.target).parent().find('input').select();
            document.execCommand("copy");
        },

        /**
         * Center the map accordingly to a selected coordinate
         *
         * @private
         */
        _centerMap: function () {
            if (null === this.lon || null === this.lat || typeof this.lon === 'undefined' || typeof this.lat === 'undefined') {
                return;
            }

            if (this._areCoordinatesValid()) {
                this.highlightLayer.removeAllFeatures();
                this.highlightLayer.addFeatures(this.feature);

                var lonLat = new OpenLayers.LonLat(this.lon, this.lat);
                var zoomlevel = this.options.zoomlevel;
                var olMapMaxZoom = this.mbMap.map.olMap.numZoomLevels -1;

                if (zoomlevel <= olMapMaxZoom) {
                    this.mbMap.map.olMap.setCenter(lonLat, zoomlevel);
                }
            } else {
                Mapbender.error(Mapbender.trans("mb.coordinatesutility.widget.error.invalidCoordinates"));
            }
        },

        /**
         * Check if coordinates to navigate are valid
         *
         * @returns boolean
         * @private
         */
        _areCoordinatesValid: function () {
            if (!$.isNumeric(this.lon) || !$.isNumeric(this.lat)) {
                return false;
            }

            var Point = new Proj4js.Point(this.lon, this.lat),
                currentProjection = this.mbMap.map.olMap.getProjectionObject();

            Proj4js.transform(currentProjection, currentProjection, Point);

            var lonLat = new OpenLayers.LonLat(Point.x, Point.y);

            return this.mbMap.map.olMap.isValidLonLat(lonLat);
        },

        /**
         * Transform a coordinate to the selected SRS
         *
         * @private
         */
        _transformCoordinateToSelectedSrs: function () {
            this._transformCoordinates();
            this._updateFields();
        },

        /**
         * Transform coordinates from selected SRS to a map SRS
         *
         * @private
         */
        _transformCoordinateToMapSrs: function () {
            var selectedSrs = $('select.srs', this.element).val();
            var inputCoordinates = $('input.input-coordinate',this.element).val();
            var inputCoordinatesArray = inputCoordinates.split(/ \s*/);


            var lat = inputCoordinatesArray.pop(),
                lon = inputCoordinatesArray.pop();

            var mapProjection = this.mbMap.map.olMap.getProjectionObject(),
                selectedProjection = new OpenLayers.Projection(selectedSrs);

            var lonlat = new OpenLayers.LonLat(lon, lat).transform(selectedProjection, mapProjection);

            this.lat = lonlat.lat;
            this.lon = lonlat.lon;

            if (this._areCoordinatesValid()) {
                this.currentMapCoordinate = this._formatOutputString(
                    lonlat,
                    mapProjection.proj.units
                );

                this.transformedCoordinate = inputCoordinates;
                this.clickPoint = new OpenLayers.Geometry.Point(lonlat.lon, lonlat.lat);

                this._updateFields();
            }
        }
    });

})(jQuery);




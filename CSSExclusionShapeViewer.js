/*
 * Copyright 2012 Adobe Systems Incorporated. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy
 * of the License at
 * 
 *       http://www.apache.org/licenses/LICENSE-2.0 
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window */

define(function (require, exports, module) {
    'use strict';
    
    // Load Brackets modules
    var InlineWidget        = brackets.getModule("editor/InlineWidget").InlineWidget;
    
    // Load tempalte
    var inlineEditorTemplate = require("text!CSSExclusionShapeViewer.html");
    
    function CSSExclusionShapeViewer(shape, width, height) {
        this.shape = shape;
        this.width = width;
        this.height = height;
        InlineWidget.call(this);
    }
    CSSExclusionShapeViewer.prototype = new InlineWidget();
    CSSExclusionShapeViewer.prototype.constructor = CSSExclusionShapeViewer;
    CSSExclusionShapeViewer.prototype.parentClass = InlineWidget.prototype;
    
    CSSExclusionShapeViewer.prototype.shape = null;
    CSSExclusionShapeViewer.prototype.width = 200;
    CSSExclusionShapeViewer.prototype.height = 200;
    CSSExclusionShapeViewer.prototype.$wrapperDiv = null;
    
    CSSExclusionShapeViewer.prototype.load = function (hostEditor) {
        this.parentClass.load.call(this, hostEditor);
        
        this.$wrapperDiv = $(inlineEditorTemplate);
        
        var svg = $(this.$wrapperDiv.find("#shape"));
        svg.css("width", this.width + "px");
        svg.css("height", this.height + "px");
        svg.append(this.shape);
        
        this.$htmlContent.append(this.$wrapperDiv);
    };

    CSSExclusionShapeViewer.prototype.close = function () {
        this.hostEditor.removeInlineWidget(this);
    };
    
    CSSExclusionShapeViewer.prototype.onAdded = function () {
        window.setTimeout(this._sizeEditorToContent.bind(this));
    };
    
    CSSExclusionShapeViewer.prototype._sizeEditorToContent = function () {
        this.hostEditor.setInlineWidgetHeight(this, this.$wrapperDiv.height() + this.height * 0.2 + 20, true);
    };
    
    module.exports = CSSExclusionShapeViewer;
});

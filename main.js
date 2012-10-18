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

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, document */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var EditorManager           = brackets.getModule("editor/EditorManager");
    
    // Local modules
    var CSSExclusionShapeViewer = require("CSSExclusionShapeViewer");
    
    var _shapeViewers = [];
    
    var svgns = "http://www.w3.org/2000/svg";
    var shapeViewSide = 200;
    
    function _getTokenListForCurrentDeclaration(hostEditor) {
        function _foundBeginning(token) {
            return token.className === "variable";
        }
        function _findStart(start) {
            var currentToken = hostEditor._codeMirror.getTokenAt(start);
            
            if (_foundBeginning(currentToken)) {
                return { ch: currentToken.start, line: start.line };
            } else if (currentToken.className === null) {
                if (currentToken.end < hostEditor._codeMirror.getLine(start.line).length) {
                    // look forward to see if the next token starts our declaration.
                    // this covers the case where the user put the cursor right at the beginning
                    // of the declaration, since getting the token gives us the token that's right
                    // before the current position
                    if (_foundBeginning(hostEditor._codeMirror.getTokenAt({ ch: currentToken.end + 1, line: start.line }))) {
                        return { ch: currentToken.end, line: start.line };
                    }
                }
                if (currentToken.string.match(/[{};]/)) {
                    return null;
                }
            }
            
            // if we didn't find anything by looking forward, we should continue looking back
            if (currentToken.start === 0) {
                if (start.line === 0) {
                    return null;
                } else {
                    return _findStart({
                        ch: hostEditor._codeMirror.getLine(start.line - 1).length,
                        line: start.line - 1
                    });
                }
            } else {
                return _findStart({ ch: currentToken.start, line: start.line });
            }
        }
        
        function _findEnd(end) {
            var currentToken = hostEditor._codeMirror.getTokenAt(end);
            
            if (currentToken.className === null) {
                if (currentToken.string.match(/[{};]/)) {
                    return { ch: currentToken.end, line: end.line };
                }
            }
            
            if (currentToken.end >= hostEditor._codeMirror.getLine(end.line).length) {
                if (end.line === hostEditor.lineCount() - 1) {
                    return end;
                } else {
                    return _findEnd({ ch: 0, line: end.line + 1});
                }
            } else {
                return _findEnd({ ch: currentToken.end + 1, line: end.line });
            }
        }
        
        function _adjustEnd(start, end) {
            if (start && (start.line > end.line || (start.line === end.line && start.ch >= end.ch))) {
                return { ch: start.ch + 1, line: start.line };
            } else {
                return end;
            }
        }
        
        // Note this assumes that the start and end given will be inside the document.
        // If they aren't, weird things may happen
        function _getTokenListForRegion(start, end) {
            var tokens = [],
                currentToken = hostEditor._codeMirror.getTokenAt(start),
                currentPosition = start,
                currentLine = hostEditor._codeMirror.getLine(start.line);
            
            while (currentPosition.ch <= end.ch && currentPosition.line <= end.line) {
                tokens.push(currentToken);
                currentPosition.ch = currentToken.end + 1;
                if (currentPosition.ch > currentLine.length) {
                    currentPosition.ch = 0;
                    currentPosition.line += 1;
                    currentLine = hostEditor._codeMirror.getLine(currentPosition.line);
                }
                currentToken = hostEditor._codeMirror.getTokenAt(currentPosition);
            }
            
            return tokens;
        }
        
        var sel = hostEditor.getSelection(false);
        var start = _findStart(sel.start);
        var end = _findEnd(_adjustEnd(start, sel.end));

        if (start) {
            return _getTokenListForRegion(start, end);
        } else {
            return null;
        }
    }
    
    var MinMaxCalculator = (function () {
        function MinMaxCalculator() {
            this.min = null;
            this.max = null;
        }
        
        function _nullGuard(f, a, b) {
            if (a === null && b !== null) {
                return b;
            } else if (b === null) {
                return a;
            } else {
                return f.call(null, a, b);
            }
        }
        
        MinMaxCalculator.prototype.addValue = function (x) {
            this.min = _nullGuard(Math.min, x, this.min);
            this.max = _nullGuard(Math.max, x, this.max);
        };
        
        return MinMaxCalculator;
    }());

    var ShapeScaler = (function () {
        // expects an object with "min" and "max" properties
        function ShapeScaler(minMax, size) {
            this._translate = minMax.min;
            this._scale = size / (minMax.max - this._translate);
            this._lengthScale = size / (minMax.max - minMax.min);
        }
        
        ShapeScaler.prototype.scale = function (x) {
            return (x - this._translate) * this._scale;
        };
        
        ShapeScaler.prototype.scaleLength = function (x) {
            return x * this._lengthScale;
        };
        
        return ShapeScaler;
    }());
    
    // FIXME right now, this does not work on relative units,
    // it only works on absolute units.
    var unitConverters = {
        'px': function (x) { return x; },
        'cm': function (x) { return x * 0.026458; },
        'mm': function (x) { return x * 0.264583; },
        'in': function (x) { return x / 96; },
        'pt': function (x) { return x * 0.75; },
        'pc': function (x) { return x * 9; }
    };
    function _convertUnitsToPixels(length) {
        var match = length.match(/^\s*(-?\d+(?:\.\d+)?)(\S+)\s*$/),
            number = match[1],
            unit = match[2],
            converter = unitConverters[unit];
        
        if (match && converter) {
            return converter.call(null, number);
        } else {
            return null;
        }
    }
    
    // There is one per shape that this code understands.
    var shapeParsers = {
        rectangle: function (params) {
            var rect = document.createElementNS(svgns, "rect"),
                width = 0,
                height = 0,
                rx = null,
                ry = null,
                minMax = new MinMaxCalculator(),
                scaler;

            if (params.length < 4 || params.length > 6) {
                return null;
            } else {
                width = _convertUnitsToPixels(params[2]);
                height = _convertUnitsToPixels(params[3]);
                if (width === null || height === null || width < 0 || height < 0) { return null; }
                if (params.length > 4) {
                    rx = _convertUnitsToPixels(params[4]);
                    if (rx === null || rx < 0) { return null; }
                    
                    if (params.length > 5) {
                        ry = _convertUnitsToPixels(params[5]);
                        if (ry === null || rx < 0) { return null; }
                    }
                }
                minMax.addValue(0);
                minMax.addValue(width);
                minMax.addValue(height);
                minMax.addValue(rx * 2);
                minMax.addValue(ry * 2);
                
                scaler = new ShapeScaler(minMax, shapeViewSide);
                width = scaler.scaleLength(width);
                height = scaler.scaleLength(height);
                
                rect.setAttribute("x", "0px");
                rect.setAttribute("y", "0px");
                rect.setAttribute("width", width + "px");
                rect.setAttribute("height", height + "px");
                if (rx !== null) {
                    rx = scaler.scaleLength(rx);
                    rect.setAttribute("rx", rx + "px");
                }
                if (ry !== null) {
                    ry = scaler.scaleLength(ry);
                    rect.setAttribute("ry", ry + "px");
                }
                return rect;
            }
        },
        circle: function (params) {
            var circle = document.createElementNS(svgns, "circle"),
                r,
                scaler;

            if (params.length !== 3) {
                return null;
            } else {
                circle.setAttribute("cx", "50%");
                circle.setAttribute("cy", "50%");
                
                r = _convertUnitsToPixels(params[2]);
                if (r === null || r < 0) { return null; }
                
                scaler = new ShapeScaler({ min: 0, max: r * 2 }, shapeViewSide);
                circle.setAttribute("r", scaler.scaleLength(r) + "px");
                return circle;
            }
        },
        ellipse: function (params) {
            var ellipse = document.createElementNS(svgns, "ellipse"),
                rx = 0,
                ry = 0,
                minMax = new MinMaxCalculator(),
                scaler;
            if (params.length !== 4) {
                return null;
            } else {
                rx = _convertUnitsToPixels(params[2]);
                ry = _convertUnitsToPixels(params[3]);
                if (rx === null || ry === null || rx < 0 || ry < 0) { return null; }
                
                minMax.addValue(0);
                minMax.addValue(rx * 2);
                minMax.addValue(ry * 2);
                scaler = new ShapeScaler(minMax, shapeViewSide);
                
                ellipse.setAttribute("cx", "50%");
                ellipse.setAttribute("cy", "50%");
                ellipse.setAttribute("rx", scaler.scaleLength(rx) + "px");
                ellipse.setAttribute("ry", scaler.scaleLength(ry) + "px");
                return ellipse;
            }
        },
        polygon: function (params) {
            var polygon = document.createElementNS(svgns, "polygon"),
                points = [],
                foundBadPoint = false,
                minMax = new MinMaxCalculator(),
                scaler = null;
            if (params.length < 1) {
                return null;
            } else {
                if (/^\s*(nonzero|evenodd)\s*$/.test(params[0])) {
                    polygon.setAttribute("fill-rule", params[0].trim());
                    params = params.slice(1);
                }
                // parse all of the points and find the min and max
                points = $.map(params, function (point, index) {
                    var xy = point.match(/^\s*(\S+)\s+(\S+)\s*$/);
                    var x, y;

                    if (xy && xy.length === 3) {
                        x = _convertUnitsToPixels(xy[1]),
                        y = _convertUnitsToPixels(xy[2]);
                        if (x !== null && y !== null) {
                            minMax.addValue(x);
                            minMax.addValue(y);
                            return { x: x, y: y };
                        }
                    }

                    foundBadPoint = true;
                    console.log("Found a point that we can't use in polygon: " + point);
                    return null;
                });
                // scale points so that they fit the viewport and format for svg
                scaler = new ShapeScaler(minMax, shapeViewSide);
                points = $.map(points, function (point, index) {
                    var x = scaler.scale(point.x);
                    var y = scaler.scale(point.y);
                    return x + "," + y;
                });
                if (foundBadPoint) {
                    return null;
                } else {
                    polygon.setAttribute("points", points.join(" "));
                    return polygon;
                }
            }
        }
    };
    
    // since the css tokenizer does some weird things with tokens,
    // we need to fix up the list so that we can process it in a reasonable manner.
    function _normalizeParameterList(tokens) {
        var params = $.map(tokens, function (e, i) { return e.string; }).join("");
        var paramsNoParens = params.match(/^\((.*)\)/)[1];
        if (paramsNoParens) {
            return paramsNoParens.split(',');
        } else {
            return [];
        }
    }
    
    function _extractShape(tokens) {
        var i,
            state = 0,
            parser,
            shape;
        for (i = 0; !parser && i < tokens.length; i++) {
            switch (state) {
            case 0: // eat up initial whitespace
                if (tokens[i].string.trim()) {
                    // consume the declaration name
                    if (tokens[i].className === "variable" &&
                            tokens[i].string.match(/^(-\w+-)?shape-(inside|outside)$/)) {
                        state = 1;
                    } else {
                        return null;
                    }
                }
                break;
            case 1: // eat up the : and any whitespace between name and value
                if (tokens[i].string.trim() && tokens[i].string !== ":") {
                    // process actual value
                    parser = shapeParsers[tokens[i].string];
                    if (!parser) {
                        return null;
                    }
                }
                break;
            default:
                console.log("Something went wrong, I don't know what state " + state + " is!");
                return null;
            }
        }

        shape = parser.call(null, _normalizeParameterList(tokens.slice(i)));
        if (shape) {
            shape.setAttribute("stroke", "red");
            shape.setAttribute("fill", "none");
        }
        return shape;
    }
    
    /**
     * This function is registered with EditManager as an inline editor provider.
     * It creates an inline editor when the cursor is on a exclusion shape CSS rule.
     *
     * @param {!Editor} hostEditor
     * @param {!{line:Number, ch:Number}} pos
     * @return {$.Promise} a promise that will be resolved with an InlineWidget
     *      or null if we're not going to provide anything.
     */
    function cssExclusionShapeViewerProvider(hostEditor, pos) {
        var result, shapeViewer, declaration, shape;
        
        if (hostEditor.getModeForSelection() !== "css") {
            return null;
        }
        
        declaration = _getTokenListForCurrentDeclaration(hostEditor);
        if (!declaration) {
            return null;
        }

        shapeViewer = _shapeViewers[pos.line];
        if (shapeViewer) {
            // FIXME we should check and see if we're on a different declaration on
            // on the line, and continue in that case instead of bailing
            shapeViewer.close();
            delete _shapeViewers[pos.line];
            return null;
        }
        
        shape = _extractShape(declaration);
        if (shape) {
            result = new $.Deferred();

            shapeViewer = new CSSExclusionShapeViewer(shape, shapeViewSide, shapeViewSide);
            shapeViewer.load(hostEditor);
            _shapeViewers[pos.line] = shapeViewer;
        
            result.resolve(shapeViewer);
        
            return result.promise();
        } else {
            return null;
        }
    }

    EditorManager.registerInlineEditProvider(cssExclusionShapeViewerProvider);
});

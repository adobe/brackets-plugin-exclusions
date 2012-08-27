/*
 * Copyright (c) 2012 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
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
    
    function _nullGuard(f, a, b) {
        if (a == null && b != null) {
            return b;
        } else if (b == null) {
            return a;
        } else {
            return f.call(null, a, b);
        }
    }

    // There is one per shape that this code understands.
    var shapeParsers = {
        rectangle: function (params) {
            if (params.length < 4 || params.length > 6) {
                return null;
            } else {
                var rect = document.createElementNS(svgns, "rect");
                rect.setAttribute("x", "0%");
                rect.setAttribute("y", "0%");
                rect.setAttribute("width", params[2].trim());
                rect.setAttribute("height", params[3].trim());
                if (params.length > 4) {
                    rect.setAttribute("rx", params[4].trim());
                    if (params.length > 5) {
                        rect.setAttribute("ry", params[5].trim());
                    }
                }
                return rect;
            }
        },
        circle: function (params) {
            if (params.length !== 3) {
                return null;
            } else {
                var circle = document.createElementNS(svgns, "circle");
                circle.setAttribute("cx", "50%");
                circle.setAttribute("cy", "50%");
                circle.setAttribute("r", params[2].trim());
                return circle;
            }
        },
        ellipse: function (params) {
            if (params.length !== 4) {
                return null;
            } else {
                var ellipse = document.createElementNS(svgns, "ellipse");
                ellipse.setAttribute("cx", "50%");
                ellipse.setAttribute("cy", "50%");
                ellipse.setAttribute("rx", params[2].trim());
                ellipse.setAttribute("ry", params[3].trim());
                return ellipse;
            }
        },
        polygon: function (params) {
            var polygon = document.createElementNS(svgns, "polygon");
            var points = [];
            var foundBadPoint = false;
            var minX, minY, maxX, maxY, translate, scale;
            if (params.length < 1) {
                return null;
            } else {
                if (/^\s*(nonzero|evenodd)\s*$/.test(params[0])) {
                    polygon.setAttribute("fill-rule", params[0].trim());
                    params = params.slice(0);
                }
                // parse all of the points and find the min and max
                points = $.map(params, function (point, index) {
                    // FIXME right now, we only accept polygons specified with pixels
                    var xy = point.match(/^\s*(-?\d+)px\s+(-?\d+)px\s*$/);
                    if (xy) {
                        minX = _nullGuard(Math.min, xy[1], minX);
                        maxX = _nullGuard(Math.max, xy[1], maxX);
                        minY = _nullGuard(Math.min, xy[2], minY);
                        maxY = _nullGuard(Math.max, xy[2], maxY);
                        return { x: xy[1], y: xy[2] };
                    } else {
                        foundBadPoint = true;
                        console.log("Found a point that we can't use in polygon: " + point);
                        return null;
                    }
                });
                // scale points so that they fit the viewport and format for svg
                translate = (minX > minY ? minY : minX);
                scale = shapeViewSide / ((maxX < maxY ? maxY : maxX) - translate);
                points = $.map(points, function (point, index) {
                    var x = (point.x - translate) * scale;
                    var y = (point.y - translate) * scale;
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
        if (hostEditor.getModeForSelection() !== "css") {
            return null;
        }
        
        var result, shapeViewer;
        var declaration = _getTokenListForCurrentDeclaration(hostEditor);
        var shape = _extractShape(declaration);
        if (shape) {
            result = new $.Deferred();

            shapeViewer = new CSSExclusionShapeViewer(shape, shapeViewSide, shapeViewSide);
            shapeViewer.load(hostEditor);
        
            result.resolve(shapeViewer);
        
            return result.promise();
        } else {
            return null;
        }
    }

    EditorManager.registerInlineEditProvider(cssExclusionShapeViewerProvider);
});

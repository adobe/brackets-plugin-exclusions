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
/*global define, brackets, $ */

define(function (require, exports, module) {
    "use strict";
    
    // Brackets modules
    var EditorManager           = brackets.getModule("editor/EditorManager");
    
    // Local modules
    var CSSExclusionShapeViewer       = require("CSSExclusionShapeViewer");
    
    function _getCurrentDeclaration(hostEditor) {
        function _foundBeginning(token) {
            return token.className === "variable";
        }
        function _findStart(start) {
            var currentToken = hostEditor._codeMirror.getTokenAt(start);
            console.log(currentToken);
            
            if (_foundBeginning(currentToken)) {
                console.log("Found Beginning!");
                return { ch: currentToken.start, line: start.line };
            } else if (currentToken.className === null) {
                console.log("className is null!");
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
            
            if (currentToken.end === hostEditor._codeMirror.getLine(end.line).length) {
                if (end.line === hostEditor.lineCount() - 1) {
                    return end;
                } else {
                    return _findEnd({ ch: 0, line: end.line + 1});
                }
            } else {
                return _findEnd({ ch: end.ch + 1, line: end.line });
            }
        }
        
        function _adjustEnd(start, end) {
            if (start && (start.line > end.line || (start.line === end.line && start.ch >= end.ch))) {
                return { ch: start.ch + 1, line: start.line };
            } else {
                return end;
            }
        }
        
        var sel = hostEditor.getSelection(false);
        var start = _findStart(sel.start);
        var end = _findEnd(_adjustEnd(start, sel.end));
        console.log(start);
        console.log(end);

        if (start) {
            hostEditor.setSelection(start, end);
            return hostEditor.getSelectedText();
        } else {
            return "";
        }
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
        
        var result, shapeViewer;
        var declaration = _getCurrentDeclaration(hostEditor);

        result = new $.Deferred();

        // FIXME what arguments should this take?
        shapeViewer = new CSSExclusionShapeViewer(declaration);
        shapeViewer.load(hostEditor);
        
        result.resolve(shapeViewer);
        
        return result.promise();
    }

    EditorManager.registerInlineEditProvider(cssExclusionShapeViewerProvider);
});

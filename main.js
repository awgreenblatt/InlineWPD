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
/*global define, $, brackets, window */

/** Extension that supports inline WebPlatform Docs */
define(function (require, exports, module) {
    "use strict";

    var CommandManager  = brackets.getModule("command/CommandManager"),
        Async           = brackets.getModule("utils/Async"),
        NativeFileSystem = brackets.getModule("file/NativeFileSystem").NativeFileSystem,
        FileUtils       = brackets.getModule("file/FileUtils"),
        EditorManager   = brackets.getModule("editor/EditorManager"),
        ExtensionUtils  = brackets.getModule("utils/ExtensionUtils"),
        Menus           = brackets.getModule("command/Menus"),
        CSSUtils        = brackets.getModule("language/CSSUtils"),
        NativeApp       = brackets.getModule("utils/NativeApp");
    
    var CSSPropDocCache = {};
    var CSSPropsServerURL = "http://ec2-184-73-148-225.compute-1.amazonaws.com/css.json";
    
    // Local modules
    var InlineWPDViewer = require("InlineWPDViewer");
    
    var KeyboardPrefs = JSON.parse(require("text!keyboard.json"));
    
    function _addFontDeclaration(url) {
        var attributes = {
                type: "text/css",
                rel:  "stylesheet",
                href: url
            };
        var $link = $("<link/>").attr(attributes);
        $link.appendTo("head");
    }
    
    function _getRemoteCSSPropsHash() {
        var result = new $.Deferred();
        
        // TODO: Change when proxy server supports this
        result.resolve("");
        
        return result.promise();
    }
    
    function _getRemoteCSSPropDetails() {
        $.get(CSSPropsServerURL, function (data) {
            if (data.hasOwnProperty("HASH") && data.HASH !== CSSPropDocCache.HASH) {
                CSSPropDocCache = data;
            
                NativeFileSystem.requestNativeFileSystem(brackets.app.getApplicationSupportDirectory(), function (fs) {
                    fs.root.getDirectory("wpd_data", {create: true}, function (dirEntry) {
                        dirEntry.getFile("cssPropsCache", {create: true}, function (fileEntry) {
                            FileUtils.writeText(fileEntry, JSON.stringify(data)).done(function () {
                            }).fail(function (err) {
                                console.log("Error writing css property cache");
                            });
                        }, function (error) {
                            console.log(error);
                        });
                    }, function (error) {
                        console.log(error);
                    });
                }, function (error) {
                    console.log(error);
                });
            }
        });
    }

    function _initCSSPropDocCache() {
        var appSupportDir = brackets.app.getApplicationSupportDirectory();
        NativeFileSystem.requestNativeFileSystem(appSupportDir, function (fs) {
            var folder = "wpd_data";
            fs.root.getDirectory(folder, {create: true}, function (dirEntry) {
                dirEntry.getFile("cssPropsCache", {create: false}, function (fileEntry) {
                    FileUtils.readAsText(fileEntry).done(function (text, modTime) {
                        CSSPropDocCache = JSON.parse(text);
                        
                        _getRemoteCSSPropsHash().done(function (hash) {
                            if (hash !== CSSPropDocCache.HASH.toString()) {
                                _getRemoteCSSPropDetails();
                            }
                        });
                    }).fail(function (error) {
                        console.log("Problems occurred reading cssPropsCache from filesystem. Updating from server.");
                        _getRemoteCSSPropDetails();
                    });
                }, function (error) {
                    console.log("cssPropsCache not found.  Updating from server.");
                    _getRemoteCSSPropDetails();
                });
            }, function (error) {
                console.log("Problems occurred reading wpd_data folder.  Updating properties from server.");
                _getRemoteCSSPropDetails();
            });
        }, function (error) {
            console.log("Problems occurred accessing native filesystem.  Updating properties from server.");
            _getRemoteCSSPropDetails();
        });
    }
    
    /**
     * When the cursor is on a CSS property, look up the definition of the property on webplatform.org
     * and view the results in an InlineWPDViewer.
     */
    function handleShowCSSDocs() {
        var editor = EditorManager.getFocusedEditor();
        if (!editor) {
            return;
        }
        
        // Only provide a WPD viewer when cursor is in CSS content
        if (editor.getModeForSelection() !== "css") {
            return;
        }
            
        // Only provide WPD viewer if the selection is within a single line
        var sel = editor.getSelection(false);
        if (sel.start.line !== sel.end.line) {
            return;
        }
        
        var cssInfo = CSSUtils.getInfoAtPos(editor, editor.getSelection().start);
        if (cssInfo && cssInfo.name) {
            var cssPropName = cssInfo.name;
            if (CSSPropDocCache && CSSPropDocCache.hasOwnProperty("PROPERTIES")) {
                // TODO: Objects should be keyed off the name w/o the css/properties/ prefix
                var cssPropDetails = CSSPropDocCache.PROPERTIES["css/properties/" + cssPropName];
                if (cssPropDetails) {
                    var wpdViewer = new InlineWPDViewer(cssPropName, cssPropDetails);
                    wpdViewer.load(editor);
                    editor.addInlineWidget(editor.getCursorPos(), wpdViewer);
                }
            }
        }
    }
    
    ExtensionUtils.loadStyleSheet(module, "style.css");
    
    _addFontDeclaration('http://fonts.googleapis.com/css?family=Gudea');
    _addFontDeclaration('http://fonts.googleapis.com/css?family=Bitter:700');
    
    var SHOW_CSS_DOCS_CMD = "inlinewpd.showCSSDocs";
    var showCSSDocsCmd = CommandManager.register("Show CSS Docs", SHOW_CSS_DOCS_CMD,
                                                 handleShowCSSDocs);
    showCSSDocsCmd.setEnabled(true);
    
    var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
    menu.addMenuItem(SHOW_CSS_DOCS_CMD, KeyboardPrefs.showCSSDocs);
    
    var editor_cmenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
    
    // Add the Commands as MenuItems of the Editor context menu
    if (editor_cmenu) {
        editor_cmenu.addMenuDivider();
        editor_cmenu.addMenuItem(SHOW_CSS_DOCS_CMD);
    }
    
    _initCSSPropDocCache();
});
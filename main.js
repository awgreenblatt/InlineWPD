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
        EditorManager   = brackets.getModule("editor/EditorManager"),
        ExtensionUtils  = brackets.getModule("utils/ExtensionUtils"),
        Menus           = brackets.getModule("command/Menus"),
        CSSUtils        = brackets.getModule("language/CSSUtils"),
        NativeApp       = brackets.getModule("utils/NativeApp");
    
    
    // Local modules
    var InlineWPDViewer = require("InlineWPDViewer");
    
    var KeyboardPrefs = JSON.parse(require("text!keyboard.json"));

    /**
     * Return the token string that is at the specified position.
     *
     * @param hostEditor {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {String} token string at the specified position
     */
    function _getCSSPropName(hostEditor, pos) {
        var token = hostEditor._codeMirror.getTokenAt(pos);
        
        // If the pos is at the beginning of a name, token will be the 
        // preceding whitespace or dot. In that case, try the next pos.
        if (token.string.trim().length === 0 || token.string === ".") {
            token = hostEditor._codeMirror.getTokenAt({line: pos.line, ch: pos.ch + 1});
        }
        
        // Return valid function expressions only (function call or reference)
        if (!((token.className === "variable") ||
              (token.className === "variable-2") ||
              (token.className === "property"))) {
            return null;
        }
        
        return token.string;
    }
    
    /**
     * Lookup a CSS property definition on webplatform.org and return its definition
     *
     * @param cssPropName CSS Property Name
     * @return {String} CSS Property definition
     */
    function _getCSSPropDefn(cssPropName) {
        var result = new $.Deferred();
        
        var baseUrl = "http://docs.webplatform.org/w/api.php?action=parse&format=json&prop=text&section=Summary&page=css/properties/";
        var url = baseUrl + cssPropName;
        var navUrl = "http://docs.webplatform.org/wiki/css/properties/" + cssPropName;
        $.get(url, function (data) {
            var fullText = data.parse.text['*'];
            var $fullText = $("<div>" + fullText + "</div>");
            var $defn = $fullText.find('#Summary').parent().nextUntil('h2');
            $defn = $('<div class="wpd-css"><h1>' + cssPropName + '</h1></div>').append($defn);
            $defn = $defn.append("<p class='more-info'><a href='" + navUrl + "'>More Info...</a></p>");
            
            $.each($defn.find('a'), function (index, value) {
                var href = value.getAttribute('href');
                if (href.charAt(0) === '/') {
                    href = 'http://docs.webplatform.org' + href;
                }
                value.setAttribute('data-href', href);
                value.setAttribute('href', '#');
            });
            
            $defn.find('a').click(function (event) {
                event.stopPropagation();
                NativeApp.openURLInDefaultBrowser(this.getAttribute('data-href'));
            });
            result.resolve($defn);
        });
        return result.promise();
    }
    
    function _addFontDeclaration(url) {
            
        var attributes = {
                type: "text/css",
                rel:  "stylesheet",
                href: url
            };
        var $link = $("<link/>").attr(attributes);
        $link.appendTo("head");
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
            _getCSSPropDefn(cssPropName).done(function (cssPropDefn) {
                var wpdViewer = new InlineWPDViewer(cssPropName, cssPropDefn);
                wpdViewer.load(editor);
                editor.addInlineWidget(editor.getCursorPos(), wpdViewer);
            });
        }
    }
    
    ExtensionUtils.loadStyleSheet(module, "style.css");
    
    _addFontDeclaration('http://fonts.googleapis.com/css?family=Gudea');
    _addFontDeclaration('http://fonts.googleapis.com/css?family=Bitter:700');
    
    var SHOW_CSS_DOCS_CMD = "inlinewpd.showCSSDocs";
    var showCSSDocsCmd = CommandManager.register("Show CSS Docs", SHOW_CSS_DOCS_CMD, handleShowCSSDocs);
    showCSSDocsCmd.setEnabled(true);
    
    var menu = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU);
    menu.addMenuItem(SHOW_CSS_DOCS_CMD, KeyboardPrefs.showCSSDocs);
    
    var editor_cmenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
    
    // Add the Commands as MenuItems of the Editor context menu
    if (editor_cmenu) {
        editor_cmenu.addMenuDivider();
        editor_cmenu.addMenuItem(SHOW_CSS_DOCS_CMD);
    }

//    var updateEnabled = function () {
//        return 
//        var cmdEnabled = false;
//        var editor = EditorManager.getFocusedEditor();
//        if (editor) {
//            var sel = editor.getSelection(false);
//            if (sel.start.line === sel.end.line) {
//                if (editor.getModeForSelection() === 'css') {
//                    var cssInfo = CSSUtils.getInfoAtPos(editor, editor.getSelection().start);
//                    if (cssInfo && cssInfo.name) {
//                        cmdEnabled = true;
//                    }
//                }
//            }
//        }
//        showCSSDocsCmd.setEnabled(cmdEnabled);
//    };
//    
//    $(editor_cmenu).on("beforeContextMenuOpen", updateEnabled);
});
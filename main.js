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
     * Parse some mediawiki markup to get its HTML equivalent.
     * We pass in the optional pageTitle in case the markup uses special variables like {{PAGENAME}}
     * 
     * @param pageTitle Title of the page the markup came from
     * @param markup Markup text we want to convert to HTML
     * @return Deferred HTML converted from markup
     */
    function _parseMarkup2HTML(pageTitle, markup) {
        var result = new $.Deferred();
        var encodedMarkup = window.encodeURIComponent(markup);
        var url = "http://docs.webplatform.org/w/api.php?action=parse&disablepp&prop=text&format=json&title=" +
            pageTitle + "&text=" + encodedMarkup;
        $.get(url, function (data) {
            result.resolve(data.parse.text['*']);
        });
        
        return result.promise();
    }
    
    /**
     * Query docs.webplatform.org for the documentation on a CSS property and return its summary.
     *
     * @param cssPropName Name of the CSS property
     * @return Deferred {String} Summary description of the CSS property
     */
    function _getCSSPropSummary(cssPropName) {
        var result = new $.Deferred();

        var query = "css/properties/" + cssPropName;
        var params = "%7C?Summary&format=json";
        var url = "http://docs.webplatform.org/w/api.php?action=ask&query=%5B%5B" + query + "%5D%5D" + params;
        $.get(url, function (data) {
            var results = data.query.results;
            if (results[query]) {
                var summary = results[query].printouts.Summary[0];
                _parseMarkup2HTML(query, summary).done(function (parsedSummary) {
                    result.resolve(parsedSummary);
                });
            }
        });
        
        return result.promise();
    }
    
    /**
     * Get the name and description for each possible value for a given CSS property
     *
     * @param cssPropname {String} Name of the CSS property
     * @return Deferred Array of value name/description pairs
     */
    function _getCSSPropValuesAndDescriptions(cssPropName) {
        var result = new $.Deferred();
        
        var query = "Value_for_property::css/properties/" + cssPropName;
        var pageTitle = "css/properties/" + cssPropName;
        var params = "%7C?Property_value%7C?Property_value_description&format=json";
        var url = "http://docs.webplatform.org/w/api.php?action=ask&query=%5B%5B" + query + "%5D%5D" + params;
        $.get(url, function (data) {
            var results = data.query.results;
            var val;
            var deferreds = [];
            for (val in results) {
                if (results.hasOwnProperty(val)) {
                    var propValObj = results[val].printouts;
                    var propVal = propValObj["Property value"];
                    var propValDesc = propValObj["Property value description"];

                    if (propVal.length && propValDesc.length) {
                        deferreds.push(_parseMarkup2HTML(pageTitle, propVal[0]));
                        deferreds.push(_parseMarkup2HTML(pageTitle, propValDesc[0]));
                    }
                }
            }

            /* Wait for all the prop value names & desciptions to arrive before proceeding */
            $.when.apply(null, deferreds).then(function () {
                var propVals = [];
                var i = 0;
                while (i < arguments.length) {
                    propVals.push({
                        propValName: arguments[i++],
                        propValDesc: arguments[i++]
                    });
                }
                result.resolve(propVals);
            });

        });
                
        return result.promise();
    }
    
    /**
     * Lookup a CSS property definition on webplatform.org and return its definition
     * At this point, we get the Summary and list of possible property values and their descriptions.
     * @param cssPropName CSS Property Name
     * @return {Object} Object containing the summary and list of possible property values and their descriptions
     */
    function _getCSSPropDetails(cssPropName) {
        var result = new $.Deferred();
        
        $.when(_getCSSPropSummary(cssPropName), _getCSSPropValuesAndDescriptions(cssPropName)).then(
            function (summary, propVals) {
                var navUrl = "http://docs.webplatform.org/wiki/css/properties/" + cssPropName;
                var propDetails = "<div class='wpd-css'><h1>" + cssPropName + "</h1>" +
                    "<div class='css-prop-summary'><h2>Summary</h2>" +
                    "<p class='css-prop-summary'>" + summary + "</p>" +
                    "<div class='css-prop-values'><h2>Values</h2>";
                
                var i;
                for (i = 0; i < propVals.length; i++) {
                    var propVal = propVals[i];
                    propDetails += "<div class='css-prop-val'><dl><dt>" + propVal.propValName + "</dt>" +
                        "<dd>" + propVal.propValDesc + "</dd>" +
                        "</dl></div>";
                }

                propDetails += "<p class='more-info'><a href='" + navUrl + "'>More Info...</a></p></div></div>";
                
                /*
                 * We don't want anyone navigating and changing the view within Brackets itself.
                 */
                var $propDetails = $(propDetails);
                $.each($propDetails.find('a'), function (index, value) {
                    var href = value.getAttribute('href');
                    if (href.substr(0, 4) !== 'http') {
                        href = 'http://docs.webplatform.org' + (href.charAt(0) !== '/' ? '/' : '') +
                            href.replace(' ', '_');
                    }
                    value.setAttribute('data-href', href);
                    value.setAttribute('href', '#');
                });
                
                $propDetails.find('a').click(function (event) {
                    event.stopPropagation();
                    NativeApp.openURLInDefaultBrowser(this.getAttribute('data-href'));
                });
                result.resolve($propDetails);
            }
        );
        
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
            _getCSSPropDetails(cssPropName).done(function (cssPropDetails) {
                var wpdViewer = new InlineWPDViewer(cssPropName, cssPropDetails);
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
});
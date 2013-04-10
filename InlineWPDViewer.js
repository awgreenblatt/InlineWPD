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


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, brackets, $, window */

define(function (require, exports, module) {
    'use strict';
    
    // Load Brackets modules
    var InlineWidget    = brackets.getModule("editor/InlineWidget").InlineWidget,
        NativeApp       = brackets.getModule("utils/NativeApp");
    
    // Load template
    var inlineEditorTemplate = require("text!InlineWPDViewer.html");
    
    function InlineWPDViewer(cssPropName, cssPropDetails) {
        this.cssPropName = cssPropName;
        this.cssPropDetails = cssPropDetails;
        InlineWidget.call(this);
    }
    
    InlineWPDViewer.prototype = Object.create(InlineWidget.prototype);
    InlineWPDViewer.prototype.constructor = InlineWPDViewer;
    InlineWPDViewer.prototype.parentClass = InlineWidget.prototype;
    
    InlineWPDViewer.prototype.cssPropName = null;
    InlineWPDViewer.prototype.cssPropDefn = null;
    InlineWPDViewer.prototype.$wrapperDiv = null;
    
    InlineWPDViewer.prototype.load = function (hostEditor) {
        InlineWPDViewer.prototype.parentClass.load.apply(this, arguments);
        
        this.$wrapperDiv = $(inlineEditorTemplate);
        
        this.$wrapperDiv.find("div.css-prop-defn > h1").text(this.cssPropName);
        this.$wrapperDiv.find("div.css-prop-summary > div").html(this.cssPropDetails.SUMMARY);

        var values = this.cssPropDetails.VALUES;
        var valuesHTML = "<dl>";
        var i;
        for (i = 0; i < values.length; i++) {
            var value = values[i];
            valuesHTML += "<dt>" + value.TITLE + "</dt>" +
                "<dd>" + value.DESCRIPTION + "</dd>";
        }
        valuesHTML += "</dl>";
        
        this.$wrapperDiv.find("div.css-prop-values > div").html(valuesHTML);
        this.$wrapperDiv.find(".more-info a").attr("href", this.cssPropDetails.URL);
        
        this.$htmlContent.append(this.$wrapperDiv);
        this.$htmlContent.click(this.close.bind(this));
        
        var $links = this.$wrapperDiv.find('a');
        $.each($links, function (index, value) {
            var href = value.getAttribute('href');
            if (href.substr(0, 4) !== 'http') {
                href = 'http://docs.webplatform.org' + (href.charAt(0) !== '/' ? '/' : '') +
                    href.replace(' ', '_');
            }
            value.setAttribute('data-href', href);
            value.setAttribute('href', '#');
        });
        
        $links.click(function (event) {
            event.stopPropagation();
            NativeApp.openURLInDefaultBrowser(this.getAttribute('data-href'));
        });
        
    };

    InlineWPDViewer.prototype.onAdded = function () {
        InlineWPDViewer.prototype.parentClass.onAdded.apply(this, arguments);
        window.setTimeout(this._sizeEditorToContent.bind(this));
    };
    
    InlineWPDViewer.prototype._sizeEditorToContent = function () {
        // TODO: image might not be loaded yet--need to listen for load event and update then.
        this.hostEditor.setInlineWidgetHeight(this, this.$wrapperDiv.height() + 20, true);
    };
    
    module.exports = InlineWPDViewer;
});
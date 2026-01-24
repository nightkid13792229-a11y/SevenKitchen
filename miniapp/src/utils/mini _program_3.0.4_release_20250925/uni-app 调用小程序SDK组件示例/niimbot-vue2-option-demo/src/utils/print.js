/**
 * @Description
 * @Version
 * @Author xuyi
 * @date 2023/1/3 16:55
 */
// 引入打印类，CommonJs规范
// const api = require('../static/JCAPI/JCAPI.js');
import api from "@/static/JCAPI/JCAPI";

export function usePrint() {


    return {
        setPlatform(platform) {
            api.setPlatform(platform)

        },

        setBuildPlatform(platform) {
            api.setBuildPlatform(platform)
        },


        startJob(gapType, darkness, totalCount, callback) {
            api.startJob(gapType, darkness, totalCount, callback)
        },


        startDrawLabel(canvasId, component, labelWidth, labelHeight, rotation = 0, canvas) {
            api.startDrawLabel(canvasId, component, labelWidth, labelHeight, rotation, canvas)
        },


        drawText(content, x, y, fontHeight, rotation = 0, options = null) {
            api.drawText(content, x, y, fontHeight, rotation, options)
        },
        
        drawTextInRect(content, x, y, width, height, fontHeight, rotation = 0, options = null) {
            api.drawTextInRect(content, x, y, width, height, fontHeight, rotation, options);
        },

        drawBarcode(content, x, y, width, height, rotation = 0, fontSize, fontHeight, position = 2) {
            api.drawBarcode(content, x, y, width, height, rotation, fontSize, fontHeight, position)
        },


        drawQRCode(content, x, y, width, height, rotation = 0, ecc = 2) {
            api.drawQRCode(content, x, y, width, height, rotation, ecc)
        },


        drawRectangle(x, y, width, height, lineWidth, isFilled = false, rotation = 0) {
            api.drawRectangle(x, y, width, height, lineWidth, isFilled, rotation)
        },


        drawLine(x, y, width, height, rotation = 0) {
            api.drawLine(x, y, width, height, rotation)
        },


        drawImage(path, x, y, width, height, rotation = 0) {
            api.drawImage(path, x, y, width, height, rotation)
        },


        endDrawLabel(callback) {
            api.endDrawLabel(callback)
        },


        print(onePageCount = 1, callback, optionPara = null) {
            api.print(onePageCount, callback, optionPara)
        },


        didReadPrintCountInfo(callback) {
            api.didReadPrintCountInfo(callback)
        },


        didReadPrintErrorInfo(callback) {
            api.didReadPrintErrorInfo(callback)
        },


        scanedPrinters(callback) {
            api.scanedPrinters(callback)
        },


        openPrinter(name, successConnect, failConnect) {
            api.openPrinter(name, successConnect, failConnect)
        },


        getConnName() {
            return api.getConnName()
        },

        getSn(callback) {
            return api.getSN(callback)
        },

        // 打印机断开连接
        closePrinter() {
            api.closePrinter()
        }
    }

}

// module.exports = { usePrint };

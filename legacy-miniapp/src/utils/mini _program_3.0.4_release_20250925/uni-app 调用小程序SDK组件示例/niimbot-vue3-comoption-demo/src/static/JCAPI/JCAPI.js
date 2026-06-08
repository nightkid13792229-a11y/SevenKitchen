/**
 * 版本3.0.4
 */

import JCSDKManager from "./JCAPIManager"
import Platform from "./JCAPIErrorCode"

let manager = JCSDKManager();

let JCSDKPrintCallBack = {
    gapType: 1,
    darkness: 3,
    count: 1,
    success: (res) => { },
    fail: (err) => { },
    complete: () => { }
}

let JCSDKPrintOptionParas = {
    //B32R支持
    epc: '',
    //H1S支持
    hasDash: false,
    //部分机型支持0-高质量打印，缺省  1-高速度打印 
    speedOrQuality: 0
}

let JCSDKPrinterGetParas = {
    code: 0,//0:正常获取，-1:获取失败  -2:忙碌 -3:不支持 -4:打印机未连接/断开/未响应
    res: Object
}

/**
 * 仅做说明使用
 * 如需引用，可直接引用 JCAPIErrorCode
 */
const JCAPISDKPlateform = {
    "wx": Platform.JCSDK_PLATFORM_WX,
    "dd": Platform.JCSDK_PLATFORM_DD,
    "fs": Platform.JCSDK_PLATFORM_FS
}

/**
* 仅做说明使用
* 如需引用，可直接引用 JCAPIErrorCode
*/
const JCAPISDKBuildPlateform = {
    "ori": Platform.JCSDK_PLATFORM_Build_Origin,
    "uniapp": Platform.JCSDK_PLATFORM_Build_Uni,
}

let JCSDKPrintImageParas = {
  /**
   * 打印份数
   * @type {number}
   * @default 1
   */
  count: 1,
  /**
   * 打印内容
   * @type {string}
   * @description base64数据(不包含data:image/png;base64,前缀)或者图片URL
   * @required
   */
  data: "image/base64",
  /**
   * 画布组件ID
   * @type {string}
   * @required
   */
  canvasId: "test",
  /**
   * 画布组件实例
   * @type {Object}
   * @required
   */
  compent: Object,
  /**
   * 内容旋转角度
   * @type {number}
   * @default 0
   * @enum {0|90|180|270}
   */
  orientation: 0,
  /**
   * 打印标签宽度(mm)
   * @type {number}
   * @default 50
   */
  width: 50,
  /**
   * 打印标签高度(mm)
   * @type {number}
   * @default 30
   */
  height: 30,
  /**
   * 图片左偏移量(像素)
   * @type {number}
   * @default 0
   */
  x: 0,
  /**
   * 图片上偏移量(像素)
   * @type {number}
   * @default 0
   */
  y: 0,
  /**
   * 打印区域宽度(mm)
   * @type {number}
   * @default 50
   */
  sWidth: 50,
  /**
   * 打印区域高度(mm)
   * @type {number}
   * @default 30
   */
  sHeight: 30,
  /**
   * 成功回调函数
   * @type {function}
   */
  success: Object,
  /**
   * 失败回调函数
   * @type {function}
   */
  fail: Object,
  /**
   * 完成回调函数(无论成功/失败)
   * @type {function}
   */
  complete: Object,
  /**
   * EPC编码(B32R打印机支持)
   * @type {string}
   * @default ''
   */
  epc: '',
  /**
   * 是否使用虚线边框(H1S打印机支持)
   * @type {boolean}
   * @default false
   */
  hasDash: false,
  /**
   * 打印质量模式
   * @type {number}
   * @default 0
   * @description 0-高质量打印，1-高速度打印(部分机型支持)
   */
  speedOrQuality: 0
}

const JCAPI = {
    /**
     * 设置小程序运行平台
     * @param {JCAPISDKPlateform} platform 平台:缺省微信
     */
    setPlatform(platform = JCAPISDKPlateform.wx) {
        manager.setPlatform(platform);
    },


    /**
     * 设置编译平台类型
     * @param {string} platform  支持：原生环境编译、Uni环境编译，缺省:原生环境编译
     */
    setBuildPlatform(platform = JCAPISDKBuildPlateform.JCSDK_PLATFORM_Build_Origin) {
        manager.setBuildPlatform(platform);
    },

    /**
     * 需要在连接（openPrinter）之前使用
     * @param {*} use 当程序多个使用蓝牙监听时，调用此方法，将监听外置出来供第三方支配
     */
    setUseThirdBleListen(use = true) {
        manager.setUseBleListen(use);
    },
    /**
     * 当 setUseThirdBleListen 设置为 true 时有效。使用示例如下：
     * ```javascript
     * JCAPI.setUseThirdBleListen(true);
     * wx.onBLECharacteristicValueChange((res) => {
     *   JCAPI.bleValueChanged(res);
     * });
     * ```
     * @param {*} res 蓝牙监听数据
     */
    bleValueChanged(res) {
        manager.onBleValueChange(res);
    },
    /**
     * 打开打印机
     * @param {string} printerName - 打印机名称
     * @param {function} didConnectedHandler - 连接成功回调函数
     * @param {function} didDisconnectedHandler - 连接断开回调函数
     */
    openPrinter(printerName, didConnectedHandler, didDisconnectedHandler) {
        manager.openPrinter(printerName, didConnectedHandler, didDisconnectedHandler);
    },
    /**
     * 关闭打印机
     */
    closePrinter() {
        manager.closePrinter();
    },

    /**
     * 搜索蓝牙设备
     * @param {function} didGetScanedPrinters - 搜索后的回调函数，用于处理搜索结果 function(list){}
     */
    scanedPrinters(didGetScanedPrinters) {
        manager.scanedPrinters(didGetScanedPrinters);
    },

    /**
     * 开始打印任务
     * @param {number} gapType - 纸张类型 1.间隙纸  2.黑标纸  3.连续纸  4.定孔纸  5.透明纸  6.标牌 10.黑标间隙
     * @param {number} darkness - 打印浓度B3S/B1/B203/B21/K3/K3W/M2 浓度范围1-5 建议3  B32/Z401 浓度范围1-15 建议8
     * @param {number} totalCount - 总打印份数，表示所有页面的打印份数之和。例如，如果你有3页需要打印，第一页打印3份，第二页打印2份，第三页打印5份，那么count的值应为10（3+2+5）。
     * @param {function} callback - 任务开启后的回调函数
     */
    startJob(gapType, darkness, totalCount, callback) {
        manager.startJob(gapType, darkness, totalCount, callback);
    },

    /**
     * 打印前开始绘制
     * @param {string} canvasId - 画布ID
     * @param {object} component - 画布所在js对象
     * @param {number} labelWidth - 标签画布宽（标签宽度，单位mm）
     * @param {number} labelHeight - 标签画布高（标签高度，单位mm）
     * @param {number} rotation - 旋转角度，默认为0，支持0/90/180/270
     * @param {Canvas} canvas - 画布对象。当使用原生小程序IDE时，`canvas` 可为 `null`；若通过调用 {@link setBuildPlatform} 方法将编译平台设置为 uni 编译时，则需要传入 `canvas` 对象，否则打印会失败。
     * @description
     * 对应的 canvas 宽高建议使用变量
     */
    startDrawLabel(canvasId, compent, canvasWidth, canvasHeight, roration = 0, canvas = null) {
        manager.startDrawLabel(canvasId, compent, canvasWidth, canvasHeight, roration, canvas);
    },

    /**
     * 绘制多行文本
     * @param {string} content 文本内容
     * @param {number} x 起点x，单位mm
     * @param {number} y 起点y，单位mm（左下角坐标）
     * @param {number} width 预设文本框宽度，单位mm
     * @param {number} height 预设文本框高度，单位mm
     * @param {number} fontHeight 字体大小，单位mm
     * @param {number} rotation 旋转角度，默认为0，支持0/90/180/270，旋转中心点为左下角
     * @param {object} options 选项，具体如下：
     *   - bold: 是否加粗，默认值为 false
     *   - italic: 是否倾斜，默认值为 false
     *   - family: 字体设置，默认值为 'SimHei'
     *   - align: 对齐方式，可选值为 'left'、'right'、'center'
     *   - lineModel: 多行文本处理模式，若 options 为空、不传 lineModel 或值不为 3，则超出预设宽高的内容将被删除；若值为 3，则超出预设宽高的内容尾部将用省略号处理。使用多行文本时，options 参数不可为 null，否则内容超出预设宽高时会异常（下一版本修复）
     * 
     * 注意事项：
     * 1. iOS 斜体不支持中文，字体自定义也不支持中文，仅支持小程序内置字体。
     */
    drawTextInRect(content, x, y, width, height, fontHeight, rotation = 0, options = null) {
        manager.drawTextInRect(content, x, y, width, height, fontHeight, rotation, options);
    },
    /**
     * 绘制单行文本
     * @param {string} content 文本内容
     * @param {number} x 起点x,单位mm
     * @param {number} y 起点y,单位mm（左下角坐标）
     * @param {number} fontHeight 字体大小,单位mm
     * @param {number} rotation 旋转角度，默认为0，支持0/90/180/270，旋转中心点为左下角
     * italic：ios不支持中文斜体
     * @options {object} {bold:false,
     *               italic:false,
     *               family:'SimHei',
     *               align:'left'/'right'/'center'}
     * 注意事项：
     * 1. iOS 斜体不支持中文，字体自定义也不支持中文，仅支持小程序内置字体。
     * 2. 0° 对齐方式中心点为 X 坐标，即左对齐时文本左下角坐标为 x，右对齐时文本右下角坐标为 x，居中对齐时文本底部中心点坐标为 x。
     * 3. 90° 对齐方式中心点为旋转后的 Y 坐标，即左对齐时文本左下角坐标为旋转后的 Y 坐标，右对齐时文本右下角坐标为旋转后的 Y 坐标，居中对齐时文本底部中心点坐标为旋转后的 Y 坐标。
     * 4. 180° 和 270° 类似，可自行尝试。
     */
    drawText(content, x, y, fontHeight, rotation = 0, options = null) {
        manager.drawText(content, x, y, fontHeight, rotation, options);
    },
    /**
     * 绘制条码
     * @param {string} content - 条码内容
     * @param {number} x - 起点x,单位mm
     * @param {number} y - 起点y,单位mm
     * @param {number} width - 宽,单位mm
     * @param {number} height - 高,单位mm
     * @param {number} rotation - 旋转角度，默认为0，支持0/90/180/270，旋转中心点左上角
     * @param {number} fontSize - 文本的字体大小,单位mm
     * @param {number} fontHeight - 文本的高度,单位mm
     * @param {number} position - 文本位置，0-条码下方 1-条码上方 2-不显示文体，此时fontSize/fontHeight无效
     */
    drawBarcode(content, x, y, width, height, rotation = 0, fontSize, fontHeight, postion = 2) {
        manager.drawBarcode(content, x, y, width, height, rotation, fontSize, fontHeight, postion);
    },
    /**
     * 绘制二维码
     * @param {string} content - 二维码内容
     * @param {number} x - 起点x,单位mm
     * @param {number} y - 起点y,单位mm（左上角坐标）
     * @param {number} width - 宽,单位mm
     * @param {number} height - 高,单位mm
     * @param {number} rotation - 旋转角度，默认为0，支持0/90/180/270，旋转中心点左上角
     * @param {number} ecc - 纠错等级 0-3
     */
    drawQRCode(content, x, y, width, height, rotation = 0, ecc = 2) {
        manager.drawQRCode(content, x, y, width, height, rotation, ecc);
    },
    /**
     * 绘制矩形
     * @param {number} x - 起点x,单位mm
     * @param {number} y - 起点y,单位mm
     * @param {number} width - 宽,单位mm
     * @param {number} height - 高,单位mm
     * @param {number} lineWidth - 线条宽,单位mm
     * @param {boolean} isFilled - 是否填充
     * @param {number} rotation - 旋转角度，默认为0，支持0/90/180/270，旋转中心点左上角
     */
    drawRectangle(x, y, width, height, lineWidth, isFilled = false, rotation = 0) {
        manager.drawRectangle(x, y, width, height, lineWidth, isFilled, rotation);
    },
    /**
     * 绘制线条
     * @param {number} x - 起点x，单位mm
     * @param {number} y - 起点y，单位mm（左下角坐标）
     * @param {number} width - 宽度，单位mm
     * @param {number} height - 高度，单位mm
     * @param {number} rotation - 旋转角度，默认为0，支持0/90/180/270，旋转中心点左上角
     *
     * @description
     * 计算线条的左上角为y坐标+线高
     */
    drawLine(x, y, width, height, rotation = 0) {
        manager.drawLine(x, y, width, height, rotation);
    },
    /**
     * 绘制图片
     * @param {string} path - 本地图片路径（暂不支持网络图片）
     * @param {number} x 起点x,单位mm
     * @param {number} y 起点y,单位mm
     * @param {number} width 宽,单位mm
     * @param {number} height 高,单位mm
     * @param {number} rotation - 旋转角度，默认为0，支持0/90/180/270，旋转中心点左上角
     *
     * @description
     * 暂不支持网络图片，需要将图片缓存到本地后，传入本地临时路径进行绘制
     * 图像背景不可以设置为透明色，否则会打印出黑块
     */
    drawImage(path, x, y, width, height, rotation = 0) {
        manager.drawImage(path, x, y, width, height, rotation);
    },
    /**
     * 结束绘制标签
     * @param {function} callback - 绘制完之后的回调
     */
    endDrawLabel(callback) {
        manager.endDrawLabel(callback);
    },
    /**
     * 提交图片URL或base64数据进行打印
     * @function printImage
     * @memberof JCAPI
     * @description 为了更好的用户体验，回调仅表示缓存成功/失败，不影响已缓存的数据，并不阻断已有的打印任务
     * @param {JCSDKPrintImageParas} para - 打印参数配置对象
     * @property {number} para.count - 打印份数
     * @property {string} para.data - 图片数据(base64或URL)
     * @property {string} para.canvasId - 画布组件ID
     * @property {Object} para.compent - 画布组件实例
     * @property {number} [para.orientation=0] - 旋转角度(0/90/180/270)
     * @property {number} [para.width=50] - 标签宽度(mm)
     * @property {number} [para.height=30] - 标签高度(mm)
     * @property {number} [para.x=0] - 图片左偏移(像素)
     * @property {number} [para.y=0] - 图片上偏移(像素)
     * @property {number} [para.sWidth=50] - 打印区域宽度(mm)
     * @property {number} [para.sHeight=30] - 打印区域高度(mm)
     * @property {function} [para.success] - 成功回调
     * @property {function} [para.fail] - 失败回调
     * @property {function} [para.complete] - 完成回调
     * @property {string} [para.epc=''] - EPC编码(B32R支持)
     * @property {boolean} [para.hasDash=false] - 是否使用虚线边框(H1S支持)
     * @property {number} [para.speedOrQuality=0] - 打印质量模式(0-高质量,1-高速度)
     */
    printImage(para) {
        manager.printImage(para);
    },

    /**
     * 打印数据
     * @param {*} onePageCount 打印当前数据份数
     * @param {*} dataW 打印数据的宽
     * @param {*} dataH 打印数据的高
     * @param {*} dataArray 打印的数据数组，要求无符号整型，数组长度=宽*高*4
     * @param {*} callback 绘制完之后的回调
     * @param {JCSDKPrintOptionParas} optionPara 可选参数
     */
    printImageData(onePageCount = 1, dataW, dataH, dataArray, callback, optionPara = null) {
        manager.printImageData(onePageCount, { width: dataW, height: dataH, data: dataArray }, callback, optionPara);
    },
    /**
    * 提交打印数据，启动打印操作。
    *
    * @param {number} onePageCount - 一页中的打印份数，默认为 1。
    * @param {Function} callback - 回调,表示可以发送下一页数据，不表示已打印完成，打印完成与否监听页码变化状态，仅打印一页一份时不回调
    * @param {Object|null} optionPara - 可选参数，用于配置打印选项。默认为 null。
    */
    print(onePageCount = 1, callback, optionPara = null) {
        console.log('JCAPI')
        manager.startPrint(onePageCount, callback, optionPara);
    },
    /**
     * 读取打印进度信息并触发回调函数
     *
     * @param {Function} callback - 回调函数，用于接收页码数据的对象：{'count': int（必需）， 'tid': string（非必需）}。
     */
    didReadPrintCountInfo(callback) {
        manager.didReadPrintCountInfo(callback);
    },
    /**
     * 读取打印错误信息并触发回调函数。
     *
     * @param {Function} callback - 回调函数，用于接收打印错误信息的数据。
     */
    didReadPrintErrorInfo(callback) {
        manager.didReadPrintErrorInfo(callback);
    },
    /**
    * 取消打印
    * @param {function} callback - 回调函数，用于处理打印取消操作的结果
    */
    cancelPrint(callback) {
        manager.cancelPrint(callback);
    },

    /**
     * 获取当前的连接名称
     *
     * 此函数通过调用manager对象的getConnName方法来获取连接名称
     *
     * @returns {string} 当前的连接名称
     */
    getConnName() {
        return manager.getConnName();
    },
    /**
     * 获取设备序列号（SN）并通过回调函数返回。
     *
     * @param {JCSDKPrinterGetParas} callback - 回调函数，用于接收设备序列号（SN）信息。
     */
    getSN(callback) {
        manager.getSN(callback);
    },
    /**
     * 获取软件版本信息并通过回调函数返回。
     * @param {JCSDKPrinterGetParas} callback - 回调函数，用于接收软件版本信息
     */
    getSoftVersion(callback) {
        manager.getSoftVersion(callback);
    },

    /**
     * 获取获取硬件版本信息并通过回调函数返回。
     * @param {JCSDKPrinterGetParas} callback - 回调函数，用于接收硬件版本信息
     */
    getHardVersion(callback) {
        manager.getHardVersion(callback);
    },
    /**
     * 获取倍率
     * @returns {number} - 返回打印倍率
     */
    getMultiple() {
        var dpi = manager.getMultiple()
        return (dpi >= 300 && dpi < 350) ? 11.81 : 8;
    },

    /**
     * 获取打印机速度/质量模式
     * @param {JCSDKPrinterGetParas} callback 可选参数
     */
    getPrintSpeedQualityWay(callback) {
        manager.getPrintWithSpeedOrQuality(callback);
    },
    /**
   * 获取标签信息，目前仅支持M2
   * @param {function} callback - 回调函数，用于返回标签信息。标签信息包含以下内容：
   *   - 索引 0: 间隙高度，单位像素
   *   - 索引 1: 标签高度（含间隙高度），单位像素
   *   - 索引 2: 纸张类型 
   *     - 1: 间隙纸
   *     - 2: 黑标纸
   *     - 3: 连续纸
   *     - 4: 定孔纸
   *     - 5: 透明纸
   *     - 6: 标牌
   *     - 10: 黑标间隙纸
   *   - 索引 3: 间隙高度，单位毫米
   *   - 索引 4: 标签高度（含间隙高度），单位毫米
   *   - 索引 5: 标签宽度，单位像素
   *   - 索引 6: 标签宽度，单位毫米
   *   - 索引 7: 尾巴方向（线缆标签、珠宝标签等）
   *     - 1: 上
   *     - 2: 下
   *     - 3: 左
   *     - 4: 右
   *   - 索引 8: 尾巴长度，单位像素
   *   - 索引 9: 尾巴长度，单位毫米
   */
    getPageInfos(callback) {
        manager.getPageInfos(callback);
    }
}


module.exports = JCAPI

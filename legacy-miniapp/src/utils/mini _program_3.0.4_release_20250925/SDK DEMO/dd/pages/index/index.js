const _my = require("../../__antmove/api/index.js")(my);

const wx = _my;
import JCAPI from "../../utils/JCAPI/JCAPI"; // index.js
// 获取应用实例

const app = getApp();
let jishu = 0;
Page({
  data: {
    canvasWidth: 320,
    canvasHeight: 200,
    // 如需尝试获取用户信息可改为false
    pageModels: [],
    showPrinters: false,
    printerLists: [],
    nowPrint: null,
    showPrinting: false,
    printedCount: 0,
    showOver: 0,
    //0:刚启动 1:点了取消 2:取消成功 3:正常打印完成 4:打印出错停止
    printingError:null,
    switch2Checked:false
  },



  getSN() {
    let deviceInfo = JCAPI.getConnName()
    if(deviceInfo!==null){
      console.log('deviceInfo',deviceInfo)
    }
    JCAPI.getSN(function (res) {
      console.log(res)
      var des = '';
      if(res.code === 0){
        des = res.res;
      }else if(res.code === -1){
        des = '获取失败';
      }
      else if(res.code === -2){
        des = '打印机忙碌';
      }
      else if(res.code === -3){
        des = '不支持';
      }else if(res.code === -4){
        des = '打印机未连接/断开/超时';
      }
      wx.showToast({title: des})
    });
  },

  getSoftVersion() {
    JCAPI.getSoftVersion(function (res) {
      console.log(res)
      var des = '';
      if(res.code === 0){
        des = res.res;
      }else if(res.code === -1){
        des = '获取失败';
      }
      else if(res.code === -2){
        des = '打印机忙碌';
      }
      else if(res.code === -3){
        des = '不支持';
      }else if(res.code === -4){
        des = '打印机未连接/断开/超时';
      }
      wx.showToast({title: des})
    });
  },

  getHardVersion() {
    JCAPI.getHardVersion(function (res) {
      console.log(res)
      var des = '';
      if(res.code === 0){
        des = res.res;
      }else if(res.code === -1){
        des = '获取失败';
      }
      else if(res.code === -2){
        des = '打印机忙碌';
      }
      else if(res.code === -3){
        des = '不支持';
      }else if(res.code === -4){
        des = '打印机未连接/断开/超时';
      }
      wx.showToast({title: des})
    });
  },

  getMultiple() {
    wx.showToast({
      title: JCAPI.getMultiple() + ""
    });
  },
  getSpeed(){
    JCAPI.gePrintSpeedQualityWay(function (res) {
      console.log(res)
      var des = '';
      if(res.code === 0){
        des = res.res;
      }else if(res.code === -1){
        des = '获取失败';
      }
      else if(res.code === -2){
        des = '打印机忙碌';
      }
      else if(res.code === -3){
        des = '不支持';
      }else if(res.code === -4){
        des = '打印机未连接/断开/超时';
      }
      wx.showToast({title: ''+des})
    });
  },
  openPrinter(e) {
    let item = {};

    if (wx.getStorageSync("print")) {
      item = wx.getStorageSync("print");
    }

    if (e && e.currentTarget.dataset.item) {
      item = e.currentTarget.dataset.item;
    }

    let self = this; // let name = "S6-D726050099"

    wx.showLoading({
      title: "连接中",
      mask: true
    });
    JCAPI.openPrinter(item.name, function () {
      wx.showToast({
        title: "连接打印机成功",
        icon: "",
        image: "",
        duration: 2000,
        mask: true,
        success: function (res) {
          wx.hideLoading();
          let Printer = self.data.printerLists;
          const arr = Printer.filter(function (items) {
            return items.name !== item.name;
          });
          wx.setStorageSync("print", item);
          self.setData({
            nowPrint: item,
            printerLists: arr
          });
        }
      });
    }, function () {
      self.setData({
        nowPrint: ""
      });
      wx.removeStorageSync("print");
      wx.hideLoading();
    });
  },

  scanPrinter() {
    let self = this; // if(wx.getStorageSync('print')){
    //   this.setData({
    //     nowPrint: wx.getStorageSync('print')
    //   })
    // }

    wx.showLoading({
      title: "搜索中",
      mask: true
    });
    JCAPI.scanedPrinters(didGetScanedPrinters => {
      wx.hideLoading();
      let arr ;
      arr = didGetScanedPrinters.filter(items => {
        // return  items.name.indexOf('B21-')>-1;
        return items.name&&items.name.length>=8;
      });

      if (self.data.nowPrint && self.data.nowPrint.name) {
        arr = arr.filter(items => {
          return items.name !== self.data.nowPrint.name;
        });
      }

      this.setData({
        showPrinters: true,
        printerLists: arr
      });
    });
  },

  disconnect: function (e) {
    let self = this; // wx.hideLoading()

    wx.showToast({
      title: "打印机连接断开",
      icon: "",
      image: "",
      duration: 2000,
      mask: true,
      success: function (res) {
        self.setData({
          nowPrint: ""
        });
        wx.removeStorageSync("print"); // self.scanedPrinters()
      },
      fail: function (res) {},
      complete: function (res) {}
    });
    JCAPI.closePrinter();
  },

  overPrint(e) {
    console.log(e);
    let self = this;
    let status = e.currentTarget.dataset.status;

    if (status < 2) {
      this.data.showOver = 1;
      JCAPI.cancelPrint(() => {
        self.setData({
          showOver: 2
        });
      });
    } else {
      this.setData({
        showOver: 0,
        printingError: null,
        showPrinting: false
      });
    }
  },

  cancelPrint(e) {
    JCAPI.cancelPrint(() => {
      let ctx = wx.createCanvasContext("test1", this);
      ctx.setFillStyle("white");
      ctx.fillRect(0, 0, 200, 80);
      ctx.draw();
      ctx.setFillStyle("black");
      ctx.setFontSize(10);
      ctx.fillText("已取消成功", 3, 30);
      ctx.draw();
    });
  },

  scanBarcode(e) {
    wx.scanCode({
      onlyFromCamera: true,
      scanType: "barCode",
      success: res => {
        console.log(res);
        let ctx = wx.createCanvasContext("test1", this);
        ctx.setFillStyle("white");
        ctx.fillRect(0, 0, 200, 80);
        ctx.draw();
        ctx.setFillStyle("black");
        ctx.setFontSize(10);
        ctx.fillText(res.code, 3, 30);
        ctx.draw();
      }
    });
  },

  print(e) {
    if (this.data.pageModels.length == 0) {
      wx.showToast({
        title: "请添加打印内容",
        icon: "none",
        duration: 2000
      });
      return;
    }

    if (!this.data.nowPrint || !this.data.nowPrint.name) {
      this.scanPrinter();
      return;
    }

    wx.setStorageSync("lastPrintData", this.data.pageModels);
    let count = 0;
    let gapType = 0;
    let darkness = 0;
    let self = this;

    for (let index = 0; index < this.data.pageModels.length; index++) {
      let item = this.data.pageModels[index];
      count += item.count;

      if (index === 0) {
        gapType = item.gapType;
        darkness = item.darkness;
      }
    }


    let ctx = wx.createCanvasContext("test1", this);
    ctx.setFillStyle("white");
    ctx.fillRect(0, 0, 200, 80);
    ctx.draw();
    ctx.setFillStyle("black");
    ctx.setFontSize(10);
    ctx.fillText("准备打印", 3, 30);
    ctx.draw();
    JCAPI.didReadPrintCountInfo(function (res) {
      console.log("-----收到页面变化数据:----");
      console.log(res);

      if (count === res.count) {
        ctx.setFillStyle("black");
        ctx.setFontSize(10);
        ctx.fillText("打印完:" + res.count + "页", 3, 30);

        if (res.tid) {
          ctx.fillText("tid=" + res.tid, 50, 30);
        }

        ctx.draw();
      } else {
        ctx.setFillStyle("black");
        ctx.setFontSize(10);
        ctx.fillText("打印了:" + res.count + "页", 3, 30);

        if (res.tid) {
          ctx.fillText("tid=" + res.tid, 50, 30);
        }

        ctx.draw();
      }
    });
    JCAPI.didReadPrintErrorInfo(function (res) {
      console.log("-----收到出错信息 :----");
      console.log(res); // self.setData({
      //   printingError:res,
      //   showOver:4
      // })

      ctx.setFillStyle("black");
      ctx.setFontSize(10);
      ctx.fillText("错误:" + res.errCode + " " + res.msg, 3, 30);
      ctx.draw();
    });
    jishu = 0;
    JCAPI.startJob(gapType, darkness, count, function () {
      self.startPrinting();
    });
  },

  startPrinting: function () {
    if (this.data.pageModels.length <= jishu) return;
    let self = this;
    let item = this.data.pageModels[jishu];
    let pageCount = item.count;
    JCAPI.startDrawLabel("test", this, item.w, item.h, item.rotation);
    let elements = item.elements;

    for (let i = 0; i < elements.length; i++) {
      let element = elements[i];

      if (element.id === 1) {
        // JCAPI.drawText(element.value, element.x, element.y, element.fontSize, element.rotation, element.bold);
        console.log("绘制内容:" +element.value);
        JCAPI.drawText(element.value,element.x,element.y,element.fontSize,element.rotation,element.options);
      } else if (element.id === 2) {
        JCAPI.drawLine(element.x, element.y, element.w, element.h, element.rotation);
      } else if (element.id === 3) {
        JCAPI.drawBarcode(element.value, element.x, element.y, element.w, element.h, element.rotation, element.fontSize, element.fontHeight, element.fontPostion);
      } else if (element.id === 4) {
        JCAPI.drawQRCode(element.value, element.x, element.y, element.w, element.h, element.rotation);
      } else if (element.id === 5) {
        JCAPI.drawRectangle(element.x, element.y, element.w, element.h, element.linewidth, element.filled, element.rotation);
      } else if (element.id === 6) {
        JCAPI.drawImage(element.value, element.x, element.y, element.w, element.h, element.rotation);
      }
    }

    var options = {}
    if(item.epc)
    {
      options['epc'] = item.epc;
    }
    if (item.speedChecked){
      options['speedOrQuality'] = 1;
    }

    JCAPI.endDrawLabel(function(){
      JCAPI.print(pageCount,function(){
        jishu++;
        self.startPrinting();
      },options);
    });
  },
  addPage: function () {
    let datas = this.data.pageModels;
    let model = {
      w: 50,
      h: 30,
      rotation: 0,
      count: 1,
      gapType: 1,
      darkness: 3,
      elements: []
    };
    if (datas.length === 0){
      model.speedChecked = false;//高速，高质量
    }
    datas.push(model);
    this.setData({
      pageModels: datas
    });
  },
  switch2Change:function(e){
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    let item = datas[index];
    console.log(item);
    if (index === 0){
      console.log(item.speedChecked);
      if (item.speedChecked){
        item.speedChecked = false;
      }else{
        item.speedChecked = true;
      }
      this.setData({
        pageModels:datas
      })
    }
  },
  addText: function (e) {
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    let item = datas[index];
    let model = {id:1,x:18,y:6,fontSize:2.2,rotation:0,value:'流水号:'+datas.length,options:null};
    item.elements.push(model);
    this.setData({
      pageModels: datas
    });
  },
  addLine: function (e) {
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    let item = datas[index];
    let model = {
      id: 2,
      x: 3,
      y: 7,
      w: 5,
      h: 1,
      rotation: 0
    };
    item.elements.push(model);
    this.setData({
      pageModels: datas
    });
  },
  addBarcode: function (e) {
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    let item = datas[index];
    let model = {
      id: 3,
      x: 3,
      y: 7,
      w: 16,
      h: 7,
      rotation: 0,
      value: "12345678",
      fontSize: 2.5,
      fontHeight: 3,
      fontPostion: 2
    };
    item.elements.push(model);
    this.setData({
      pageModels: datas
    });
  },
  addQrcode: function (e) {
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    let item = datas[index];
    let model = {
      id: 4,
      x: 3,
      y: 3,
      w: 12,
      h: 12,
      rotation: 0,
      value: "12345678"
    };
    item.elements.push(model);
    this.setData({
      pageModels: datas
    });
  },
  addRect: function (e) {
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    let item = datas[index];
    let model = {
      id: 5,
      x: 3,
      y: 7,
      w: 10,
      h: 8,
      rotation: 0,
      linewidth: 1,
      filled: false
    };
    item.elements.push(model);
    this.setData({
      pageModels: datas
    });
  },
  addPicture: function (e) {
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    let item = datas[index];
    let model = {
      id: 6,
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      rotation: 0
    };
    item.elements.push(model);
    this.setData({
      pageModels: datas
    });
  },
  delElement: function (e) {
    console.log("点击删除")
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    let parentIndex = e.currentTarget.dataset.parent;
    let item = datas[parentIndex];
    item.elements.splice(index, 1);
    this.setData({
      pageModels: datas
    });
  },
  delPage: function (e) {
    let datas = this.data.pageModels;
    let index = e.currentTarget.dataset.item;
    datas.splice(index, 1);
    this.setData({
      pageModels: datas
    });
  },

  onLoad() {
    if (wx.getUserProfile) {
      this.setData({
        canIUseGetUserProfile: true
      });
    }
    //设置API平台类型为钉钉
    JCAPI.setPlatform("钉钉")
    let item = [];

    if (wx.getStorageSync("lastPrintData")) {
      item = wx.getStorageSync("lastPrintData");
    }

    this.setData({
      pageModels: item
    });
  },
  onShow(){
    if(app.currentData){
      let models = app.currentData;
      app.currentData = null;
      this.setData({
        pageModels:models
      })
    }
  },
  getUserProfile(e) {
    // 推荐使用wx.getUserProfile获取用户信息，开发者每次通过该接口获取用户个人信息均需用户确认，开发者妥善保管用户快速填写的头像昵称，避免重复弹窗
    wx.getUserProfile({
      desc: "展示用户信息",
      // 声明获取用户个人信息后的用途，后续会展示在弹窗中，请谨慎填写
      success: res => {
        console.log(res);
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
      }
    });
  },

  getUserInfo(e) {
    // 不推荐使用getUserInfo获取用户信息，预计自2021年4月13日起，getUserInfo将不再弹出弹窗，并直接返回匿名的用户个人信息
    console.log(e);
    this.setData({
      userInfo: e.detail.userInfo,
      hasUserInfo: true
    });
  },

  inputGapType(e) {
    let item = e.currentTarget.dataset.item;
    this.data.pageModels[item].gapType = parseInt(e.detail.value);
  },

  inputDarkness(e) {
    let item = e.currentTarget.dataset.item;
    this.data.pageModels[item].darkness = parseInt(e.detail.value);
  },

  inputPageWidth(e) {
    let item = e.currentTarget.dataset.item;
    this.data.pageModels[item].w = parseFloat(e.detail.value);
  },

  inputPageHeight(e) {
    let item = e.currentTarget.dataset.item;
    this.data.pageModels[item].h = parseFloat(e.detail.value);
  },

  inputPageRotation(e) {
    let item = e.currentTarget.dataset.item;
    this.data.pageModels[item].rotation = parseInt(e.detail.value);
  },

  inputEpc(e) {
    let item = e.currentTarget.dataset.item;
    this.data.pageModels[item].epc = e.detail.value;
  },

  inputPageNumber(e) {
    let item = e.currentTarget.dataset.item;
    let count = parseInt(e.detail.value);
    this.data.pageModels[item].count = count;
  },

  inputElementX(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].x = parseFloat(e.detail.value);
    console.log(this.data.pageModels);
  },

  inputElementY(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].y = parseFloat(e.detail.value);
    console.log(this.data.pageModels);
  },

  inputElementW(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].w = parseFloat(e.detail.value);
    console.log(this.data.pageModels);
  },

  inputElementH(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].h = parseFloat(e.detail.value);
    console.log(this.data.pageModels);
  },

  inputElementFontHeight(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].fontSize = parseFloat(e.detail.value);
    console.log(this.data.pageModels);
  },

  inputElementBarcodeFontHeight(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].fontHeight = parseFloat(e.detail.value);
    console.log(this.data.pageModels);
  },

  inputElementFontPosition(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    let value = parseInt(e.detail.value);
    console.log(value);
    if (value !== 0 && value !== 1 && value !== 2) return;
    this.data.pageModels[parentIndex].elements[childIndex].fontPostion = parseInt(e.detail.value);
    console.log(this.data.pageModels);
  },

  inputElementValue(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].value = e.detail.value;
    console.log(this.data.pageModels);
  },

  inputElementLineWidth(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].linewidth = parseFloat(e.detail.value);
    console.log(this.data.pageModels);
  },

  inputElementRotation(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].rotation = parseInt(e.detail.value);
    console.log(this.data.pageModels);
  },

  filledChanged(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    this.data.pageModels[parentIndex].elements[childIndex].filled = e.detail.value;
    console.log(this.data.pageModels);
  },

  selectPic(e) {
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item; // this.data.pageModels[parentIndex].elements[childIndex].value = e.detail.value;
    // console.log(this.data.pageModels);

    let self = this;
    dd.chooseImage({
      count: 1,
      success: (res) => {
          var tempFilePaths = res.filePaths;

        if (tempFilePaths.length > 0) {
          var path=tempFilePaths[0];
          console.log("文件路径："+path);
          console.log("文件路径s："+JSON.stringify(res.filePaths));
           var pageModels=self.data.pageModels;
           console.log("values："+pageModels[parentIndex].elements[childIndex].value);
           pageModels[parentIndex].elements[childIndex].value = path;
           console.log("values2222："+pageModels[parentIndex].elements[childIndex].value);

          self.setData({
            pageModels: pageModels
          });
        }
        // dd.alert({
        //   title: '选中的图片',
        //   content: JSON.stringify(res.filePaths)
        // })
      },
    });
  },

  switchChange(e){
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    let options = this.data.pageModels[parentIndex].elements[childIndex].options;
    if(options){
      options.bold = e.detail.value;
    }else{
      options = {};
      options.bold = e.detail.value;
    }
    this.data.pageModels[parentIndex].elements[childIndex].options = options;
    console.log(this.data.pageModels);
  },

  switchChange2(e){
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    let options = this.data.pageModels[parentIndex].elements[childIndex].options;
    if(options){
      options.italic = e.detail.value;
    }else{
      options = {};
      options.italic = e.detail.value;
    }
    this.data.pageModels[parentIndex].elements[childIndex].options = options;
    console.log(this.data.pageModels);
  },

  inputFontFamily(e){
    console.log(e);
    let parentIndex = e.currentTarget.dataset.parent;
    let childIndex = e.currentTarget.dataset.item;
    let options = this.data.pageModels[parentIndex].elements[childIndex].options;
    if(options){
      options.family = e.detail.value;
    }else{
      options = {};
      options.family = e.detail.value;
    }
    this.data.pageModels[parentIndex].elements[childIndex].options = options;
    console.log(this.data.pageModels);
  },

  closeDialog(e) {
    this.setData({
      showPrinters: false
    });
  },

  testDraw() {
    manager.startDrawLabel("test", this, 45, 400, 0);
    manager.drawBarcode("12345678", 18, 6, 18, 20, 0);
    manager.drawRectangle(3, 40, 30, 50, 1, false, 0);
    manager.drawQRCode("12345678", 5, 200, 40, 40, 0);
    manager.drawText("精臣小程序!!!", 3, 48, 2.2, 0);
    manager.drawLine(3, 35, 70, 3, 0);
    manager.drawLine(3, 7, 5, 1, 0);
    manager.drawBarcode("12345678", 3, 350, 30, 50, 0);
    manager.endDrawLabel(function () {
      wx.canvasGetImageData({
        canvasId: "test",
        height: 3200,
        width: 360,
        x: 0,
        y: 0,
        success: res => {
          function ab2hex(buffer) {
            const hexArr = Array.prototype.map.call(new Uint8Array(buffer), function (bit) {
              return ("00" + bit.toString(16)).slice(-2);
            });
            return hexArr.join("");
          }

          var datas = DataUntils.dealImageData(res, 200, {
            left: 0,
            rifht: 0
          }, 200, 0);

          for (var i = 0; i < datas.length; i++) {
            var arr = datas[i];

            for (var j = 0; j < arr.length; j++) {
              var buffer = arr[j];
              console.log(ab2hex(buffer));
            }
          }
        },
        fail: error => {// self.printer.sendPrintError(ErrorCode.JCSDK_PRINT_ERR_GetDATA,obj.fail,obj.complete);
        }
      }, this);
    });
  },

  antmoveAction: function () {
    //执行时动态赋值，请勿删除
  }
});

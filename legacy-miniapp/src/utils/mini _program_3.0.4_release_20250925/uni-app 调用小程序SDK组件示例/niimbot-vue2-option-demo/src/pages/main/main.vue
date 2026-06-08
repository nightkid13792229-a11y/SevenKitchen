<template>
  <view>
    <button @click="goToConnectPage()">连接打印机</button>
    <button @click="printLabel('text')">单行文本打印（50mmx30mm）</button>
    <button @click="printLabel('textRect')">多行文本打印（50mmx30mm）</button>
    <button @click="printLabel('barcode')">一维码打印（50mmx30mm）</button>
    <button @click="printLabel('qrcode')">二维码打印（50mmx30mm）</button>
    <button @click="printLabel('line')">线条打印（50mmx30mm）</button>
    <button @click="printLabel('rectangle')">矩形打印（50mmx30mm）</button>
    <button @click="printLabel('image')">图片打印（50mmx30mm）</button>
    <button @click="printLabel('combination')">组合打印（50mmx30mm）</button>
    <button @click="printLabel('batch')">批量打印（50mmx30mm）</button>


    <!-- 钉钉使用的 canvas -->
    <canvas v-if="platform === 'DingTalk'" id="dingtalkCanvas" :width="canvasWidthResponsive"
      :height="canvasHeightResponsive"></canvas>

    <!-- 微信和飞书使用的 canvas -->
    <canvas v-else-if="platform === 'WeChat' || platform === 'FeiShu'" canvas-id="wechatFeishuCanvas" :style="{
      width: canvasWidthResponsive + 'px',
      height: canvasHeightResponsive + 'px'
    }"></canvas>
  </view>


</template>

<script>
import { usePrint } from '@/utils/print';

const {
  startJob,
  startDrawLabel,
  drawText,
  drawBarcode,
  drawQRCode,
  drawRectangle,
  drawLine,
  drawImage,
  endDrawLabel,
  print,
  didReadPrintCountInfo,
  didReadPrintErrorInfo,
  getSn,
  setPlatform,
  drawTextInRect
} = usePrint();
export default {


  data() {
    return {
      imageSrc: "",
      canvasWidth: 999,//200dpi设备 标签物理宽度x8，300dpi设备 标签物理宽度x11.81
      canvasHeight: 999,//200dpi设备 标签物理高度x8，300dpi设备 标签物理高度x11.81
      quantity: 1,
      pages: 1,
      commitIndex: 0,
      printDataArr: [],
      platform: null,
    }
  },
  computed: {
    // 响应式宽高
    canvasWidthResponsive() {
      return this.canvasWidth;
    },
    canvasHeightResponsive() {
      return this.canvasHeight;
    },

  },
  created() {
    this.setPlatform()
  },

  methods: {
    setPlatform() {
      uni.getSystemInfo({
        success: (res) => {
          console.log("res.hostName", res.hostName)
          res.hostName = res.hostName.toLowerCase();
          console.log('res.hostName', res.hostName)
          switch (res.hostName) {
            case 'wechat':
            case 'wxwork':
              setPlatform('微信');
              this.platform = 'WeChat';
              break;
            case 'dingtalk':
              setPlatform('钉钉');
              this.platform = 'DingTalk';
              break;
            case 'feishu':
            case 'devtools':
              setPlatform('飞书');
              this.platform = 'FeiShu';
              break;
            default:
              console.log('未识别的平台');
          }


          console.log('platform', this.platform)
        },
      });


    },
    goToConnectPage() {

      uni.navigateTo({
        url: '../index/index'
      });
    },


    /**
     * 打印标签
     * 
     * @param printType 打印类型：text、textRect、barcode、qrcode、line、rectangle、image、combination、batch
     */
    printLabel(printType) {
      this.handlePrint(printType);
    },
    // 统一打印入口
    handlePrint(printType) {
      getSn((res) => {
        if (res.code === -4) {
          uni.showToast({ title: '打印机未连接', icon: 'none' });
          return;
        }
        this.initPrintJob(printType);
      });

    },
    // 初始化打印任务
    async initPrintJob(printType) {
      console.log('printType', printType)
      let printData = await this.generatePrintData(printType);
      if (!printData) {
        return;
      }

      console.log('printData', printData)
      console.log('isArray', Array.isArray(printData))
      // //判断printData是否为Array
      if (Array.isArray(printData)) {
        this.printDataArr = printData
      } else {
        this.printDataArr = [printData]
      }
      this.pages = this.printDataArr.length
      this.commitIndex = 0;
      console.log('pages', this.pages)
      uni.showToast({ title: '开始打印' });

      didReadPrintCountInfo(res => console.log(res.count));
      didReadPrintErrorInfo(res => console.log(res.errCode));

      console.log('total', this.pages * this.quantity)
      console.log('startJob', startJob)
      startJob(1, 3, this.pages * this.quantity, () => {
        console.log('startJob', printType)
        this.startPrint()
      });

    },
    //根据打印类型生成打印数据
    async generatePrintData(printType) {
      if (printType === 'text') {
        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'text',
              json: {
                content: 'content' + this.printed,
                x: 2,
                y: 24,
                fontHeight: 3,
                rotation: 0,
                options: {}
              }
            }
          ]
        };
      } if (printType === 'textRect') {
        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'textRect',
              json: {
                content: 'multiple content 多行文本|multiple content 多行文本|multiple content 多行文本',
                x: 2,
                y: 2,
                width: 46,
                height: 24,
                fontHeight: 3,
                rotation: 0,
                options: { lineModel: 3 }
              }
            }
          ]
        };
      } else if (printType === 'barcode') {
        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'barcode',
              json: {
                content: '12345678' + this.commitIndex,
                x: 2,
                y: 10,
                width: 24,
                height: 10,
                rotation: 0,
                fontSize: 3,
                fontHeight: 5,
                position: 0
              }
            }
          ]
        };
      } else if (printType === 'qrcode') {
        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'qrcode',
              json: {
                content: '12345678' + this.commitIndex,
                x: 2,
                y: 10,
                width: 10,
                height: 10,
                rotation: 0,
                ecc: 2
              }
            }
          ]
        };
      } else if (printType === 'line') {
        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'line',
              json: {
                x: 2,
                y: 10,
                width: 24,
                height: 0.25,
                rotation: 0,
              }
            }
          ]
        };
      } else if (printType === 'rectangle') {
        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'rectangle',
              json: {
                x: 2,
                y: 10,
                width: 24,
                height: 10,
                lineWidth: 0.25,
                isFilled: false,
                rotation: 0,
              }
            }
          ]
        };
      } else if (printType === 'image') {
        //正式项目会验证域名,如若未在管理后台进行域名配置，此处会报错，请在项目后台更新域名配置，，操作路径：“详情-域名信息，配置完成后，刷新项目配置后重新编译项目
        const imagePath = 'https://www.niimbot.com/file/upload/img/help/2025-04/680f5c14ccd64.png';
        let tempFilePath = '';
        try {
          // 下载图片
          tempFilePath = await this.downloadImage(imagePath);
        } catch (error) {
          console.log('drawImage error', error);
        }

        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'image',
              json: {
                path: tempFilePath,
                x: 2,
                y: 10,
                width: 10,
                height: 10,
                rotation: 0,
              }
            }
          ]
        };
      } else if (printType === 'combination') {
        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'barcode',
              json: {
                content: '12345678' + this.commitIndex,
                x: 2,
                y: 12,
                width: 24,
                height: 10,
                rotation: 0,
                fontSize: 3,
                fontHeight: 5,
                position: 0
              }
            },
            {
              type: 'text',
              json: {
                content: 'content' + this.commitIndex,
                x: 2,
                y: 5,
                fontHeight: 3,
                rotation: 0,
                options: {}
              }
            }
          ]
        };
      } else if (printType === 'batch') {
        return [
          {
            width: 50,
            height: 30,
            rotation: 0,
            element: [
              {
                type: 'barcode',
                json: {
                  content: '123456781',
                  x: 2,
                  y: 12,
                  width: 24,
                  height: 10,
                  rotation: 0,
                  fontSize: 3,
                  fontHeight: 5,
                  position: 0
                }
              },
              {
                type: 'text',
                json: {
                  content: 'content1',
                  x: 2,
                  y: 5,
                  fontHeight: 3,
                  rotation: 0,
                  options: {}
                }
              }
            ]
          },
          {
            width: 50,
            height: 30,
            rotation: 0,
            element: [
              {
                type: 'barcode',
                json: {
                  content: '123456782',
                  x: 2,
                  y: 12,
                  width: 24,
                  height: 10,
                  rotation: 0,
                  fontSize: 3,
                  fontHeight: 5,
                  position: 0
                }
              },
              {
                type: 'text',
                json: {
                  content: 'content2',
                  x: 2,
                  y: 5,
                  fontHeight: 3,
                  rotation: 0,
                  options: {}
                }
              }
            ]
          }
        ];
      } else {
        alert('不支持的打印类型');
        return null;
      }

    },

    startPrint() {
      console.log('开始绘制');
      let canvasId = '';
      console.log('platform', this.platform)
      if (this.platform === 'DingTalk') {
        canvasId = 'dingtalkCanvas';
      } else if (this.platform === 'WeChat' || this.platform === 'FeiShu') {
        canvasId = 'wechatFeishuCanvas';
      }
      console.log('canvasId', canvasId)

      const ctx = uni.createCanvasContext(canvasId);
      let index = this.commitIndex;
      //解析JSON
      const labelWidth = this.printDataArr[index].width
      const labelHeight = this.printDataArr[index].height
      console.log('labelWidth', labelWidth)
      console.log('labelHeight', labelHeight)
      this.handleDrawing(canvasId, ctx, labelWidth, labelHeight, 0)
    },
    // 统一绘图处理
    handleDrawing(canvasId, ctx, labelWidth, labelHeight, rotation) {
      console.log('handleDrawing')
      startDrawLabel(canvasId, this, labelWidth, labelHeight, rotation, ctx);
      // 用于处理不同类型元素的绘制
      this.handleElementDrawing();
      this.finalizePrintJob();

    },

    handleElementDrawing() {
      let index = this.commitIndex;
      this.printDataArr[index].element.forEach(element => {
        if (element.type === 'text') {
          drawText(element.json.content, element.json.x, element.json.y, element.json.fontHeight, element.json.rotation, element.json.options)
        }
        if (element.type === 'textRect') {
          drawTextInRect(element.json.content, element.json.x, element.json.y, element.json.width, element.json.height, element.json.fontHeight, element.json.rotation, element.json.options)
        } else if (element.type === 'barcode') {
          drawBarcode(element.json.content, element.json.x, element.json.y, element.json.width, element.json.height, element.json.rotation, element.json.fontSize, element.json.fontHeight, element.json.position)
        } else if (element.type === 'image') {
          drawImage(element.json.path, element.json.x, element.json.y, element.json.width, element.json.height, element.json.rotation)
        } else if (element.type === 'qrcode') {
          drawQRCode(element.json.content, element.json.x, element.json.y, element.json.width, element.json.height, element.json.rotation)
        } else if (element.type === 'rectangle') {
          drawRectangle(element.json.x, element.json.y, element.json.width, element.json.height, element.json.lineWidth, element.json.isFilled, element.json.rotation)
        } else if (element.type === 'line') {
          drawLine(element.json.x, element.json.y, element.json.width, element.json.height, element.json.rotation)
        }
      });
    },


    // 完成绘制提交打印任务
    finalizePrintJob() {
      endDrawLabel(() => {
        console.log('endDrawLabel')
        print(this.quantity, () => {
          if (this.commitIndex < this.printDataArr.length-1 ) {
            this.commitIndex++
            this.startPrint()
          }
          
        });
      });
    },

    async downloadImage(url) {
      return new Promise((resolve, reject) => {
        uni.downloadFile({
          url: url,
          success: (res) => {
            if (res.statusCode === 200) {
              console.log('下载成功', res);
              resolve(res.tempFilePath);
            } else {
              reject('下载失败');
            }
          }
        });
      })

    }



  }
}

</script>

<style>
button {
  background-color: #04BE02;
  color: white;
  margin: 16px;
  font-size: 14px;
}

button:active {
  background-color: #1f761e;
  /* 按下时的背景颜色，选择比原颜色深一些的色调 */
  color: white;
}

/* 将canvas元素置于屏幕左侧 */
canvas {
  /* 将canvas的左边缘定位到屏幕宽度的100%处，使其完全超出屏幕左侧显示区域 */
  /* position: absolute; */
  /* left: 100%; */
  /* 新增属性，canvas边框为1px，实线，黑色 ,用于调试时间查看canvas大小*/
  /* border: 1px solid #000; */
  /*新增属性，canvas背景白色，透明度为1，即不透明*/
  background: #fff;
  opacity: 1;

}
</style>

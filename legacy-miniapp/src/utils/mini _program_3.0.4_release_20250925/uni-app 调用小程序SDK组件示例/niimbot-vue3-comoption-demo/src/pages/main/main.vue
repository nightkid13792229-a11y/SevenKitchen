<template>
  <view>
    <button @click="goToConnectPage">连接打印机</button>
    <button @click="printLabel('text')">单行文本打印（50mmx30mm）</button>
    <button @click="printLabel('textRect')">多行文本打印（50mmx30mm）</button>
    <button @click="printLabel('barcode')">一维码打印（50mmx30mm）</button>
    <button @click="printLabel('qrcode')">二维码打印（50mmx30mm）</button>
    <button @click="printLabel('line')">线条打印（50mmx30mm）</button>
    <button @click="printLabel('rectangle')">矩形打印（50mmx30mm）</button>
    <button @click="printLabel('image')">图片打印（50mmx30mm）</button>
    <button @click="printLabel('combination')">组合打印（50mmx30mm）</button>
    <button @click="printLabel('batch')">批量打印（50mmx30mm）</button>
  </view>

  <view>
    <canvas canvas-id="myCanvas" id="myCanvas" :width="canvasWidthResponsive" :height="canvasHeightResponsive" :style="{
      width: canvasWidthResponsive + 'px',
      height: canvasHeightResponsive + 'px'
    }" />
  </view>
</template>

<script>
import { ref, onMounted, getCurrentInstance } from 'vue';
import { usePrint } from '@/composables/print';

export default {
  setup() {
    const quantity = ref(1);
    const commitIndex = ref(0);
    const pages = ref(1);
    const printDataArr = ref([]); // 定义打印数据数组
    const canvasWidthResponsive = ref(400);//200dpi设备 标签物理宽度x8，300dpi设备 标签物理宽度x11.81
    const canvasHeightResponsive = ref(320);//200dpi设备 标签物理高度x8，300dpi设备 标签物理高度x11.81
    const instance = getCurrentInstance();

    onMounted(() => {
      uni.getSystemInfo({
        success: function (res) {
          res.hostName = res.hostName.toLowerCase();
          console.log("res.hostName", res.hostName)
          switch (res.hostName) {
            case 'wechat':
            case 'wxwork':
              setPlatform('微信');
              break;
            case 'dingtalk':
              setPlatform('钉钉');
              break;
            case 'feishu':
              setPlatform('飞书');
              break;
            default:
              console.log('未识别的平台');
          }
        },
      });

    });

    const {
      setPlatform,
      getSn,
      startJob,
      startDrawLabel,
      drawText,
      drawTextInRect,
      drawBarcode,
      drawQRCode,
      drawRectangle,
      drawLine,
      drawImage,
      endDrawLabel,
      print,
      didReadPrintCountInfo,
      didReadPrintErrorInfo
    } = usePrint();

    // 定义一个名为 goToConnectPage 的箭头函数，用于导航到连接页面
    const goToConnectPage = () => {
      // 使用 uni.navigateTo 方法跳转到指定页面，此处的页面路径为 '../index/index'
      uni.navigateTo({
        url: '../index/index'
      });
    };


    /**
     * 打印标签
     * @param printType 打印类型：text、textRect、barcode、qrcode、line、rectangle、image、combination、batch
     */
    const printLabel = (printType) => {
      handlePrint(printType)
    };

    const handlePrint = (printType) => {

      getSn((res) => {
        if (res.code === -4) {
          uni.showToast({ title: '打印机未连接', icon: 'none' });
          return;
        }
        initPrintJob(printType)
      })
      // initPrintJob(printType)
    };
    const initPrintJob = async (printType) => {

      const printData = await generatePrintData(printType)
      console.log('printData', printData)
      console.log('isArray', Array.isArray(printData))
      if (Array.isArray(printData)) {
        printDataArr.value = printData
      } else {
        printDataArr.value = [printData]
      }
      console.log('printDataArr', printDataArr.value)
      pages.value = printDataArr.value.length
      commitIndex.value = 0;
      console.log('pages', pages.value)
      uni.showToast({ title: '开始打印' });

      didReadPrintCountInfo(res => console.log(res.count));
      didReadPrintErrorInfo(res => console.log(res.errCode));

      console.log('total', pages.value * quantity.value)
      console.log('startJob', startJob)
      startJob(1, 3, pages.value * quantity.value, () => {
        console.log('startJob', printType)
        startPrint()
      });
    }

    const generatePrintData = async (printType) => {
      if (printType === 'text') {
        return {
          width: 50,
          height: 30,
          rotation: 0,
          element: [
            {
              type: 'text',
              json: {
                content: 'content' + commitIndex.value,
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
                content: '12345678' + commitIndex.value,
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
                content: '12345678' + commitIndex.value,
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
                content: '12345678' + commitIndex.value,
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
                content: 'content' + commitIndex.value,
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
    }

    

    const startPrint = () => {
      let index = commitIndex.value
      const currentData = printDataArr.value[index]
      const { width: labelWidth, height: labelHeight } = currentData

      handleDrawing("myCanvas", labelWidth, labelHeight, 0, currentData)
    }
    // 统一绘图处理
    const handleDrawing = (canvasId, labelWidth, labelHeight, rotation, currentData) => {
      console.log('handleDrawing')
      startDrawLabel(canvasId, instance.proxy, labelWidth, labelHeight, rotation);
      // 用于处理不同类型元素的绘制
      handleElementDrawing(currentData);
      finalizePrintJob();

    }

    const handleElementDrawing = (currentData) => {
      currentData.element.forEach(element => {
        if (element.type === 'text') {
          drawText(element.json.content, element.json.x, element.json.y, element.json.fontHeight, element.json.rotation, element.json.options)
        } else if (element.type === 'textRect') {
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
    }


    // 完成绘制提交打印任务
    const finalizePrintJob = () => {
      endDrawLabel(() => {
        print(quantity.value, () => {
          if (commitIndex.value < printDataArr.value.length - 1) {
            commitIndex.value ++
            startPrint()
          }
        });
      });
    }

    const downloadImage = (url) => {
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


    return {
      quantity,
      commitIndex,
      canvasWidthResponsive,
      canvasHeightResponsive,
      goToConnectPage,
      printLabel,
      handlePrint,
      initPrintJob,
      startPrint,
      handleDrawing,
      handleElementDrawing,
      finalizePrintJob,
      downloadImage,
      setPlatform,

    };
  },
};
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

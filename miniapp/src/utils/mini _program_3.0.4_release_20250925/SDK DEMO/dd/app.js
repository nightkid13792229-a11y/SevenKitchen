import "./__antmove/component/componentClass.js";
my.global = {};
my.styleV2 = true;
const _my = require("./__antmove/api/index.js")(my);
const wx = _my;
// app.js
App({
    onLaunch() {
        // 展示本地存储能力
        const logs = wx.getStorageSync("logs") || [];
        logs.unshift(Date.now());
        wx.setStorageSync("logs", logs); // 登录

        wx.login({
            success: res => {
                // 发送 res.code 到后台换取 openId, sessionKey, unionId
            }
        });
    },

    globalData: {
        userInfo: null
    },

    onShow(options) {

      dd.getClipboard({
        success: ({ text }) => {

                let str = text;
                // console.info(str)
                let head = "$永无bug¥";
                let tail = "¥永无bug$";
                let idx1 = str.indexOf(head);
                let idx2 = str.indexOf(tail);
                if (idx1 != -1 && idx2 != -1) {
                  str = str.substring(head.length);
                  str = str.substring(0, str.length - tail.length);
                  let obj = JSON.parse(str);
                  if (typeof obj == typeof {}) {
                    dd.confirm({
                      title: '检测到模板数据',
                      content:"存储为:" + obj.name,
                      confirmButtonText: '确定',
                      cancelButtonText: '取消',
                      success: (result) => {
                        if(result.confirm){
                          let item = [];
                          var printData= dd.getStorageSync({ key: 'saveDatas' })
                          console.info(printData)
                          if(printData!=null&&printData!=undefined){
                            if(printData.data==null){
                              printData.data=[]
                            }
                            item=printData.data
                            item.unshift(obj);
                          }
                          console.info(item)
                          dd.setStorageSync({
                            key: 'saveDatas',
                            data: item
                          });
                        }
                      },
                    });
                  }
              }
        },
      });
    }
});

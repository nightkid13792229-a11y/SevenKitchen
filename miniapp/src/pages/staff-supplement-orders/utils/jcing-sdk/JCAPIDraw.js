
var DrawSDK = (function () {
  var instance = null;

  function Singleton() {
    this.debug = 0;
    this.init();
  }
  Singleton.prototype.init = function () {
    this.data = "DrawSDK";
  }

  Singleton.prototype.startDrawLabel=function(canvasId,compent,canvasWidth,canvasHeight,rotation) {
    this.canvasRotation = this.getRotation(rotation);
    var ctx = wx.createCanvasContext(canvasId, compent);
    this.ctx = ctx;
    let maxW = canvasWidth > canvasHeight ? canvasWidth : canvasHeight;
    maxW = this.mm2px(maxW);
    if(compent && compent.setData != null){
      compent.setData({
        canvasWidth:maxW,
        canvasHeight:maxW
      });
    }
    ctx.draw();
    ctx.setFillStyle('#fff');
    ctx.fillRect(0,0,maxW,maxW);
    return ctx;
  }

  Singleton.prototype.getRotation=function(rotate){
    let newRotate = parseInt(((rotate%360)+360)%360);
    if(newRotate%90 == 0) return newRotate;
    if(newRotate < 90){
      return 0;
    }else if(newRotate< 180){
      return 90;
    }else if(newRotate < 270 ){
      return 180;
    }else{
      return 270;
    }
  }

  Singleton.prototype.mm2px=function(mm){
    return Math.ceil(mm * 8);
  }

  Singleton.prototype.drawText=function(ctx,content,x,y,fontHeight,rotation,options) {
    ctx.save();
    let fontH = this.mm2px(fontHeight);
    x = this.mm2px(x);
    y = this.mm2px(y);
    ctx.setFontSize(fontH);
    ctx.translate(x,y);
    ctx.rotate(this.getRotation(rotation)*Math.PI/180);
    ctx.translate(-x,-y);
    ctx.setFillStyle("#000");
    let align = 'left';
    if(options)
    {
      let font = '';
      if(options.italic){
        font += 'italic ';
      }else{
        font += 'normal ';
      }
      if(options.bold){
        font += 'bold ';
      }
      font += fontH;
      font += 'px ';
      if(options.family && options.family != ''){
        font += options.family;
      }else{
        font += 'SimHei';
      }
      // let font = 'normal bold '+ fontH +'px SimHei';
      ctx.font = font;
      if(options.align){
        if(options.align == 'center'){
          align = 'center';
        }else if(options.align == 'right'){
          align = 'right';
        }
      }
    }
    ctx.setTextAlign(align);
    ctx.fillText(content,x,y);
    ctx.restore();
  }


  Singleton.prototype.drawRectangle=function(ctx,x,y,width,height,lineWidth,isFilled,rotation) {
    x = this.mm2px(x);
    y = this.mm2px(y);
    width = this.mm2px(width);
    height = this.mm2px(height);
    ctx.save();
    let lineW = this.mm2px(lineWidth);
    ctx.translate(x,y);
    ctx.rotate(this.getRotation(rotation)*Math.PI/180);
    ctx.translate(-x,-y);
    if(isFilled){
      ctx.setFillStyle('#000');
      ctx.fillRect(x,y,width,height);
    }else{
      ctx.setLineWidth(lineW);
      ctx.setStrokeStyle('#000');
      ctx.strokeRect(x,y,width,height);
    }
    ctx.restore();
  }

  Singleton.prototype.drawLine=function(ctx,x,y,width,height,rotation) {
    x = this.mm2px(x);
    y = this.mm2px(y);
    width = this.mm2px(width);
    height = this.mm2px(height);
    ctx.save();
    ctx.setFillStyle("#000");
    ctx.translate(x,y);
    ctx.rotate(this.getRotation(rotation)*Math.PI/180);
    ctx.translate(-x,-y);
    ctx.fillRect(x,y,width,height);
    ctx.restore();
  }

  Singleton.prototype.drawImage=function(ctx,path,x,y,width,height,rotation) {
    x = this.mm2px(x);
    y = this.mm2px(y);
    width = this.mm2px(width);
    height = this.mm2px(height);
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(this.getRotation(rotation)*Math.PI/180);
    ctx.translate(-x,-y);
    ctx.drawImage(path,x,y,width,height);
    ctx.restore();
  }

  Singleton.prototype.endDrawLabel=function(ctx,callback) {
    let self = this;
    let timeOut = setTimeout(() => {
      if((self.debug & 0x1) == 0x1){
        console.log('JCAPIDraw draw time out');
      }
      if(callback){
        callback();
      }
    }, 5000);
    if((self.debug & 0x1) == 0x1){
      console.log('JCAPIDraw setTimeout,timeOut id='+timeOut);
    }
    ctx.draw(
      false,function(){
        clearTimeout(timeOut);
        if((self.debug & 0x1) == 0x1){
          console.log('JCAPIDraw clear time out,timeOut id='+timeOut);
        }
        // self.drawError = null;
        if(callback){
          callback();
        }
      }
    );
  }

  return function () {
    if (instance == null) {
      instance = new Singleton();
    }
    return instance;
  };


})();


export default DrawSDK;
<template>
  <view class="bluetooth-wrapper">
    <view class="device-connect" v-if="printDevice">
      <view class="title">已经配对设备</view>
      <view class="flex-space-between">
        <text class="device-text">
          <uni-icons custom-prefix="iconfont" type="icon-lanya" size="20" />
          {{ printDevice.name || '' }}
        </text>
        <text class="connect-stop" @tap="cancelConnect">断开</text>
      </view>
    </view>
    <view class="flex-space-between">
      <text class="scan-device-number">共搜索到{{ deviceData.length }}个蓝牙设备</text>
      <text class="refresh-scan" @tap="handleSearchDevice">重新搜索</text>
    </view>
    <view class="device-list">
      <view class="flex-space-between" v-for="(item, index) in deviceData" :key="index" @tap="handleConnect(item)">
        <uni-icons custom-prefix="iconfont" type="icon-lanya" size="20" />
        <text class="device-text">{{ item.name }}</text>
      </view>
    </view>
    <view class="section-wrapper">
      <view>温馨提示</view>
      <view>1.首次使用需将手机与打印机配对</view>
      <view>2.打印时请保持打印机与蓝牙均属于开启状态</view>
      <view>3.未搜索到可用机型,可尝试以下解决方法:</view>
      <view class="sub">a.检查打印机是否打开状态</view>
      <view class="sub">b.关闭手机蓝牙重新打开</view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue';

import { usePrint } from '@/composables/print';
const { scanedPrinters, getConnName, openPrinter, closePrinter } = usePrint();

// 可以支持的打印机及型号
const deviceData = ref([]);
const printDevice = ref(undefined);

// 取消连接
function cancelConnect() {
  const disconnectedDevice = this.printDevice;
  closePrinter();
  printDevice.value = undefined;
  handleSearchDevice();
  if (disconnectedDevice) {
    this.deviceData.unshift(disconnectedDevice);
  }
}

// 搜索打印机
function handleSearchDevice() {
  uni.showLoading({
    title: '搜索打印机中...',
  });

  scanedPrinters((printers) => {
    printers = printers.filter((val) => val.name && !val.name.includes("未知设备"));

    if (printDevice.value && printDevice.value.name) {
      if (!printers.some((val) => val.deviceId === printDevice.value.deviceId)) {
        printers.unshift(printDevice.value);
      } else {
        printers = printers.filter((val) => val.deviceId !== printDevice.value.deviceId);
      }
    }
    deviceData.value = printers.reduce((res, item) => {
      if (!res.some((val) => val.deviceId === item.deviceId)) {
        res.push(item);
      }
      return res;
    }, []);
    uni.hideLoading();
    console.log(deviceData, 'deviceData');
  });
}

// 连接打印机
function handleConnect(item) {
  console.log('handleConnect', item);
  uni.showLoading({
    title: '正在连接中...',
  });
  openPrinter(
    item.name,
    () => {
      printDevice.value = item;
      deviceData.value = deviceData.value.filter((val) => val.deviceId !== item.deviceId);
      uni.hideLoading();
    },
    () => {
      uni.hideLoading();
      uni.showToast({
        icon: 'none',
        title: '打印机连接失败，请确认打印机是否开机',
      });
    },
  );
}

onMounted(() => {
  const connDevice = getConnName();
  if (connDevice) {
    printDevice.value = connDevice;
  }
  handleSearchDevice();
});
</script>

<style >
.bluetooth-wrapper {
	height: 100vh;
	background-color: #f5f5f5;
	padding: 32px;
}

.bluetooth-wrapper>.device-connect>.title {
	color: #595959;
	margin-bottom: 32px;
}

.bluetooth-wrapper>.device-connect>.flex-space-between {
	padding: 24px;
	border-radius: 24px;
	background: #fafafa;
	display: flex;
	justify-content: space-between;
	align-items: center;
}

/* 设备名称样式调整 */
.bluetooth-wrapper>.device-connect>.flex-space-between>.device-text {
	flex: 1;
	/* 允许设备名称占据剩余空间 */
}

.bluetooth-wrapper>.device-connect>.flex-space-between>.connect-stop {
	padding: 12px 24px;
	border-radius: 36px;
	text-align: center;
	background-color: #ebebeb;
}


.bluetooth-wrapper>.flex-space-between {
	display: flex;
	justify-content: space-between;
	margin-top: 42px;
}

.bluetooth-wrapper>.flex-space-between .refresh-scan {
	font-size: 16px;
	color: #04BE02;
}

.bluetooth-wrapper>.flex-space-between .scan-device-number {
	font-size: 16px;
	color: #595959;
}

.bluetooth-wrapper .device-list {
	margin-top: 28px;
}

.bluetooth-wrapper .device-list>.flex-space-between {
	padding: 24px;
	margin-bottom: 32px;
	justify-content: flex-start;
	border-radius: 24px;
	background: #fafafa;
}

.bluetooth-wrapper .device-list .device-text {
	margin-left: 17px;
	font-size: 14px;
	color: #262626;
	font-weight: 500;
}

.section-wrapper {
	margin-top: 60px;
	font-size: 14px;
	color: #888;
}

.section-wrapper>view:first-of-type {
	font-size: 16px;
	font-weight: 600;
	color: #333;
	margin-bottom: 20px;
}

.section-wrapper>view.sub {
	padding-left: 40px;
}
</style>

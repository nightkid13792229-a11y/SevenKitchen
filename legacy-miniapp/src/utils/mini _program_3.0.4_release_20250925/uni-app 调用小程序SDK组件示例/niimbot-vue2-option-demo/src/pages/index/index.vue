<template>
	<view class="bluetooth-wrapper">
		<view class="device-connect" v-if="printDevice">
			<view class="title">已连接的设备</view>
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
			<view class="flex-space-between" v-for="(item, index) in deviceData" :key="index"
				@tap="handleConnect(item)">
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

<script>
import {
	usePrint
} from '@/utils/print';
const {
	scanedPrinters,
	getConnName,
	openPrinter,
	closePrinter
} = usePrint();


var isConnectManually = false;
export default {
	data() {
		return {
			deviceData: [],
			printDevice: null,
			supportDevice: ["B3S", "B3S_P", "B1", "B203", "B31", "B4", "K2", "K3", "M2", "M3", "Z401"]
		}
	},
	methods: {
		// 取消连接
		cancelConnect() {
			const disconnectedDevice = this.printDevice;
			closePrinter();
			isConnectManually = false;
			console.log('断开打印机');
			this.printDevice = null;
			if (disconnectedDevice) {
				this.deviceData.unshift(disconnectedDevice);
			}
		},
		// 搜索打印机
		handleSearchDevice() {
			uni.showLoading({
				title: '搜索打印机中...',
			});
			scanedPrinters((printers) => {
				console.log(printers, 'printers');
				printers = printers.filter((val) => val.name && !val.name.includes("未知设备"));
				// 检查是否存在有效的打印设备
				if (this.printDevice && this.printDevice.name) {
					// 判断设备是否已在列表中，不存在则添加到列表开头
					if (!printers.some((val) => val.deviceId === this.printDevice.deviceId)) {
						printers.unshift(this.printDevice.value);
					} else {
						// 设备已存在则从列表中移除
						printers = printers.filter((val) => val.deviceId !== this.printDevice.deviceId);
					}
				}
				// 对打印机列表进行去重处理，确保deviceId唯一
				this.deviceData = printers.reduce((res, item) => {
					if (!res.some((val) => val.deviceId === item.deviceId)) {
						res.push(item);
					}
					return res;
				}, []);

				uni.hideLoading();
				console.log(this.deviceData, 'deviceData');
			});
		},
		// 连接打印机
		handleConnect(item) {
			console.log('开始连接');
			console.log('handleConnect', item);
			uni.showLoading({
				title: '正在连接中...',
			});
			isConnectManually = true;
			openPrinter(
				item.name,
				() => {
					uni.hideLoading();
					console.log('连接成功');
					this.printDevice = item;
					this.deviceData = this.deviceData.filter((val) => val.deviceId !== item.deviceId);

				},
				() => {
					if (isConnectManually) {
						uni.hideLoading();
						console.log('连接失败');

						uni.showToast({
							icon: 'none',
							title: '打印机连接失败，请确认打印机是否开机',
						});
					} else {
						uni.showToast({
							icon: 'none',
							title: '断开打印机成功',
						});
					}

				},
			);
		}
	},
	mounted() {
		const connDevice = getConnName();
		if (connDevice) {
			this.printDevice = connDevice;
		}
		this.handleSearchDevice();
	}
}
</script>

<style>
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
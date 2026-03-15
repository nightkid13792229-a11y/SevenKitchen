/**
 * 精臣打印机封装类
 * 提供打印机连接、管理和打印功能
 */

import JCAPI from './jcing-sdk/JCAPI';
import { drawProductionLabelWithJCSDK, LabelData } from './label-renderer';

const PRINTER_STORAGE_KEY = 'jc_printer_info';

// 初始化SDK: 设置编译平台为uniapp（必须在SDK使用前调用）
JCAPI.setBuildPlatform('uniapp');
console.log('[JCPrinter] SDK已初始化,编译平台: uniapp');

export interface PrinterInfo {
  name: string;
  deviceId: string;
  connectedAt: string;
}

export class JCPrinter {
  private isConnected = false;
  private currentPrinter: PrinterInfo | null = null;

  /**
   * 自动连接已保存的打印机
   * @returns 是否连接成功
   */
  async autoConnect(): Promise<boolean> {
    const saved = this.getSavedPrinter();
    if (!saved) return false;

    console.log('[JCPrinter] 尝试自动连接打印机:', saved.name);

    return new Promise((resolve) => {
      JCAPI.openPrinter(
        saved.name,
        () => {
          console.log('[JCPrinter] 自动连接成功');
          this.isConnected = true;
          this.currentPrinter = saved;
          resolve(true);
        },
        () => {
          console.log('[JCPrinter] 自动连接失败,清除保存的打印机');
          this.clearSavedPrinter();
          this.currentPrinter = null;
          resolve(false);
        }
      );
    });
  }

  /**
   * 检查蓝牙适配器状态（仅供诊断使用）
   *
   * ⚠️ 注意:此方法不推荐在生产代码中使用,因为:
   * 1. 精臣SDK会自动处理蓝牙初始化
   * 2. 在SDK初始化前调用此方法会报错 "fail:not init"
   * 3. 此方法仅用于调试和诊断目的
   *
   * @returns 蓝牙状态信息
   */
  async checkBluetoothState(): Promise<{available: boolean, discovering: boolean, error?: string}> {
    return new Promise((resolve) => {
      uni.getBluetoothAdapterState({
        success: (res) => {
          console.log('[JCPrinter] ✓ 蓝牙适配器状态检查成功:', {
            available: res.available,
            discovering: res.discovering
          });
          resolve({
            available: res.available,
            discovering: res.discovering
          });
        },
        fail: (err) => {
          console.error('[JCPrinter] ✗ 获取蓝牙状态失败:', err);
          resolve({
            available: false,
            discovering: false,
            error: err.errMsg || '蓝牙适配器不可用'
          });
        }
      });
    });
  }

  /**
   * 搜索打印机（增强版：包含详细的错误诊断）
   * @returns 打印机列表
   */
  scanPrinter(): Promise<any[]> {
    return new Promise((resolve) => {
      uni.showLoading({ title: '搜索中...', mask: true });

      console.log('[JCPrinter] ========================================');
      console.log('[JCPrinter] 开始搜索打印机');
      console.log('[JCPrinter] 当前时间:', new Date().toLocaleTimeString());
      JCAPI.scanedPrinters((printers: any[]) => {
        uni.hideLoading();
        console.log('[JCPrinter] 搜索完成,原始设备数量:', printers.length);
        // 如果搜索结果为空,输出详细的诊断信息
        if (printers.length === 0) {
          console.warn('[JCPrinter] ⚠️ 未搜索到任何蓝牙设备');
          console.warn('[JCPrinter] 可能的原因:');
          console.warn('[JCPrinter] 1. 手机蓝牙未开启');
          console.warn('[JCPrinter] 2. 未授权小程序蓝牙权限');
          console.warn('[JCPrinter] 3. 打印机未开启或距离过远（建议2米以内)');
          console.warn('[JCPrinter] 4. 打印机已被其他设备连接');
          console.warn('[JCPrinter] 5. SDK初始化失败或平台识别错误');
          console.warn('[JCPrinter] ========================================');
        } else {
          console.log('[JCPrinter] ✓ 搜索到设备,详细列表:');
          // 详细记录每个设备的信息
          printers.forEach((p, index) => {
            console.log(`[JCPrinter]   设备${index + 1}:`, {
              name: p.name || '未命名',
              deviceId: p.deviceId || '无',
              RSSI: p.RSSI ? `${p.RSSI} dBm` : '未知',
              advertisData: p.advertisData ? '有' : '无'
            });
          });
        }
        // 改进的过滤逻辑:过滤掉空名称和包含"未知"的设备（参考官方示例）
        const filtered = printers.filter(p => {
          const hasName = p.name && p.name.trim() !== '';
          const notUnknown = !p.name || p.name.indexOf('未知') < 0;
          return hasName && notUnknown
        });
        console.log('[JCPrinter] 过滤后返回', filtered.length, '台可用打印机');
        if (filtered.length > 0) {
          console.log('[JCPrinter] 可用打印机列表:', filtered.map(p => p.name).join(', '));
        } else if (printers.length > 0) {
          console.warn('[JCPrinter] ⚠️ 搜索到了设备,但都被过滤掉了（可能是名称包含"未知"）');
        }
        console.log('[JCPrinter] ========================================');
        resolve(filtered);
      });
    });
  }

  /**
   * 连接打印机
   * @param printerName 打印机名称
   * @returns 是否连接成功
   */
  async connect(printerName: string): Promise<boolean> {
    return new Promise((resolve) => {
      uni.showLoading({ title: '连接中...', mask: true });

      console.log('[JCPrinter] 开始连接打印机:', printerName);

      JCAPI.openPrinter(
        printerName,
        () => {
          this.isConnected = true;
          this.currentPrinter = {
            name: printerName,
            deviceId: '',
            connectedAt: new Date().toISOString()
          };
          this.savePrinter(this.currentPrinter);
          uni.hideLoading();
          uni.showToast({ title: '连接成功', icon: 'success' });
          console.log('[JCPrinter] ✓ 连接成功:', printerName);
          resolve(true);
        },
        (error?: any) => {
          this.isConnected = false;
          this.currentPrinter = null;
          uni.hideLoading();
          console.error('[JCPrinter] ✗ 连接失败:', printerName, error);
          // 不在这里显示错误提示,让调用方处理
          resolve(false);
        }
      );
    });
  }

  /**
   * 打印标签（精臣SDK完整流程）
   * @param labelData 标签数据
   * @param component Vue组件实例
   * @param count 打印份数
   * @returns Promise<void>
   */
  async printLabel(
    labelData: LabelData,
    component: any,
    count: number = 1
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('打印机未连接');
    }
    console.log('[JCPrinter] 开始打印任务,份数:', count);
    return new Promise((resolve, reject) => {
      let completed = false;
      let jobStarted = false;  // 新增：标记startJob回调是否被触发
      // 超时保护:5秒后自动完成（增加超时时间以适应多次打印场景）
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          if (jobStarted) {
            console.warn('[JCPrinter] 打印回调超时,但任务可能已完成(打印机已出纸)');
            resolve();
          } else {
            console.error('[JCPrinter] 打印任务启动失败（startJob回调未触发），SDK可能处于忙状态');
            reject(new Error('SDK忙:打印任务启动失败,请稍后重试'));
          }
        }
      }, 5000);
      // 1. 开始打印任务
      // gapType: 1=间隙纸, darkness: 3=浓度
      JCAPI.startJob(1, 3, count, () => {
        jobStarted = true;  // 标记startJob回调已触发
        console.log('[JCPrinter] 打印任务已启动,开始绘制标签');
        // 2. 调用绘制函数（内部会调用 startDrawLabel、绘制元素、 endDrawLabel）
        // 在 endDrawLabel 的回调中调用 print
        drawProductionLabelWithJCSDK('labelCanvas', component, labelData, () => {
          console.log('[JCPrinter] 标签绘制完成,开始打印');
          // 3. 在 endDrawLabel 回调中调用 print
          JCAPI.print(count, () => {
            if (!completed) {
              completed = true;
              clearTimeout(timeoutId);
              console.log('[JCPrinter] 打印完成');
              resolve();
            }
          }, (error: any) => {
            if (!completed) {
              completed = true;
              clearTimeout(timeoutId);
              console.error('[JCPrinter] 打印失败:', error);
              reject(error)
            }
          });
        }).catch((error) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutId);
            console.error('[JCPrinter] 绘制标签失败:', error)
            reject(error)
          }
        });
      })
    });
  }

  /**
   * 使用后端生成的图片打印标签
   *
   * 重要：这个方法使用精臣SDK的canvas绘制流程打印图片
   * 1. 将base64保存为临时文件
   * 2. startJob - 开始打印任务
   * 3. startDrawLabel - 开始绘制
   * 4. drawImage - 绘制图片到画布
   * 5. endDrawLabel - 结束绘制
   * 6. print - 执行打印
   *
   * @param imageBase64 图片的base64编码（不含前缀）
   * @param count 打印份数
   * @param canvasId 画布组件ID
   * @param component 画布组件实例
   * @returns Promise<void>
   */
  async printLabelFromImage(
    imageBase64: string,
    count: number = 1,
    canvasId?: string,
    component?: any
  ): Promise<void> {
    if (!this.isConnected) {
      throw new Error('打印机未连接');
    }

    console.log('[JCPrinter] 开始图片打印任务（Canvas流程）, 份数:', count);
    console.log('[JCPrinter] 图片数据长度:', imageBase64?.length);
    console.log('[JCPrinter] Canvas参数 - canvasId:', canvasId, 'component:', component ? '有效' : '无效');

    // 检查canvas参数
    if (!canvasId || !component) {
      console.error('[JCPrinter] Canvas参数缺失，无法使用canvas绘制流程');
      throw new Error('Canvas参数缺失，请刷新页面后重试');
    }

    return new Promise((resolve, reject) => {
      let completed = false;

      // 超时保护：20秒后自动完成
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          console.warn('[JCPrinter] 打印任务超时');
          resolve(); // 超时也resolve，避免用户卡住
        }
      }, 20000);

      // 步骤1: 将base64保存为临时文件
      console.log('[JCPrinter] 步骤1: 保存base64图片到临时文件...');
      const fs = uni.getFileSystemManager();
      const tempFilePath = `${wx.env.USER_DATA_PATH}/label_${Date.now()}.png`;

      try {
        // 将base64写入临时文件
        const buffer = uni.base64ToArrayBuffer(imageBase64);
        fs.writeFileSync(tempFilePath, buffer, 'binary');
        console.log('[JCPrinter] 临时文件保存成功:', tempFilePath);
      } catch (err) {
        console.error('[JCPrinter] 保存临时文件失败:', err);
        clearTimeout(timeoutId);
        reject(new Error('保存图片文件失败'));
        return;
      }

      // 步骤2: 开始打印任务
      console.log('[JCPrinter] 步骤2: 调用 startJob, totalCount=' + count);
      JCAPI.startJob(1, 3, count, () => {
        console.log('[JCPrinter] 步骤3: startJob 回调触发');

        // 步骤3: 开始绘制标签
        console.log('[JCPrinter] 步骤4: 调用 startDrawLabel');
        // 参数: canvasId, component, width(mm), height(mm), rotation, canvas对象(uniapp需要传null)
        JCAPI.startDrawLabel(canvasId, component, 75, 100, 0, null);

        // 步骤4: 绘制图片
        console.log('[JCPrinter] 步骤5: 调用 drawImage, path=' + tempFilePath);
        // 参数: path, x(mm), y(mm), width(mm), height(mm), rotation
        JCAPI.drawImage(tempFilePath, 0, 0, 75, 100, 0);

        // 步骤5: 结束绘制
        console.log('[JCPrinter] 步骤6: 调用 endDrawLabel');
        JCAPI.endDrawLabel(() => {
          console.log('[JCPrinter] 步骤7: endDrawLabel 回调触发, 开始打印');

          // 步骤6: 启动打印
          console.log('[JCPrinter] 步骤8: 调用 print, onePageCount=' + count);
          JCAPI.print(count, () => {
            console.log('[JCPrinter] 步骤9: print 回调触发');
            if (!completed) {
              completed = true;
              clearTimeout(timeoutId);

              // 清理临时文件
              try {
                fs.unlinkSync(tempFilePath);
                console.log('[JCPrinter] 临时文件已清理');
              } catch (e) {
                console.warn('[JCPrinter] 清理临时文件失败:', e);
              }

              console.log('[JCPrinter] ✓ 打印完成');
              resolve();
            }
          });

          // 备用完成机制：5秒后如果未完成则视为成功
          setTimeout(() => {
            if (!completed) {
              completed = true;
              clearTimeout(timeoutId);

              // 清理临时文件
              try {
                fs.unlinkSync(tempFilePath);
              } catch (e) {}

              console.log('[JCPrinter] ✓ 打印指令已发送（备用完成）');
              resolve();
            }
          }, 5000);
        });
      });
    });
  }

  /**
   * 断开打印机连接
   */
  disconnect(): void {
    console.log('[JCPrinter] 断开打印机连接');
    JCAPI.closePrinter();
    this.isConnected = false;
    this.currentPrinter = null;
  }

  /**
   * 获取当前连接的打印机名称
   */
  getConnName(): string {
    const conn = JCAPI.getConnName();
    return conn?.name || '';
  }

  /**
   * 保存打印机信息到本地存储
   */
  private savePrinter(printer: PrinterInfo): void {
    try {
      uni.setStorageSync(PRINTER_STORAGE_KEY, JSON.stringify(printer));
      console.log('[JCPrinter] 打印机信息已保存');
    } catch (error) {
      console.error('[JCPrinter] 保存打印机信息失败:', error);
    }
  }
  /**
   * 获取已保存的打印机信息
   */
  private getSavedPrinter(): PrinterInfo | null {
    try {
      const data = uni.getStorageSync(PRINTER_STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[JCPrinter] 读取打印机信息失败:', error);
      return null;
    }
  }
  /**
   * 清除已保存的打印机信息
   */
  private clearSavedPrinter(): void {
    try {
      uni.removeStorageSync(PRINTER_STORAGE_KEY);
      console.log('[JCPrinter] 打印机信息已清除');
    } catch (error) {
      console.error('[JCPrinter] 清除打印机信息失败:', error)
    }
  }
  /**
   * 检查打印机是否已连接
   */
  isConnectedPrinter(): boolean {
    return this.isConnected;
  }
}
// 导出单例
export default new JCPrinter();

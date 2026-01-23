/**
 * 精臣打印机封装类
 * 提供打印机连接、管理和打印功能
 */

import JCAPI from './jcing-sdk/JCAPI';
import { drawProductionLabelWithJCSDK, LabelData } from './label-renderer';

const PRINTER_STORAGE_KEY = 'jc_printer_info';

// 初始化SDK：设置编译平台为uniapp（必须在SDK使用前调用）
JCAPI.setBuildPlatform('uniapp');
console.log('[JCPrinter] SDK已初始化，编译平台: uniapp');

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
          console.log('[JCPrinter] 自动连接失败，清除保存的打印机');
          this.clearSavedPrinter();
          this.currentPrinter = null;
          resolve(false);
        }
      );
    });
  }

  /**
   * 搜索打印机
   * @returns 打印机列表
   */
  scanPrinter(): Promise<any[]> {
    return new Promise((resolve) => {
      uni.showLoading({ title: '搜索中...', mask: true });

      console.log('[JCPrinter] 开始搜索打印机');

      JCAPI.scanedPrinters((printers: any[]) => {
        uni.hideLoading();

        // 记录所有搜索到的设备
        console.log('[JCPrinter] 原始搜索到', printers.length, '台设备');
        printers.forEach((p, index) => {
          console.log(`[JCPrinter] 设备${index + 1}:`, p.name || '未命名', p);
        });

        // 过滤掉没有名称的设备，但保留包含"未知"的设备
        const filtered = printers.filter(p => p.name);

        console.log('[JCPrinter] 过滤后返回', filtered.length, '台打印机');
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
          console.log('[JCPrinter] 连接成功:', printerName);
          resolve(true);
        },
        (error?: any) => {
          this.isConnected = false;
          this.currentPrinter = null;
          uni.hideLoading();
          console.error('[JCPrinter] 连接失败:', printerName, error);

          // 不在这里显示错误提示，让调用方处理
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

    console.log('[JCPrinter] 开始打印任务，份数:', count);

    return new Promise((resolve, reject) => {
      let completed = false;

      // 超时保护：3秒后自动完成（实际打印只需1-2秒，SDK回调可能不触发）
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          console.warn('[JCPrinter] 打印回调超时，但任务可能已完成（打印机已出纸）');
          resolve();
        }
      }, 3000);

      // 1. 开始打印任务
      // gapType: 1=间隙纸, darkness: 3=浓度
      JCAPI.startJob(1, 3, count, () => {
        console.log('[JCPrinter] 打印任务已启动，开始绘制标签');

        // 2. 调用绘制函数（内部会调用 startDrawLabel、绘制元素、endDrawLabel）
        // 在 endDrawLabel 的回调中调用 print
        drawProductionLabelWithJCSDK('labelCanvas', component, labelData, () => {
          console.log('[JCPrinter] 标签绘制完成，开始打印');

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
              reject(error);
            }
          });
        }).catch((error) => {
          if (!completed) {
            completed = true;
            clearTimeout(timeoutId);
            console.error('[JCPrinter] 绘制标签失败:', error);
            reject(error);
          }
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
      console.error('[JCPrinter] 清除打印机信息失败:', error);
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

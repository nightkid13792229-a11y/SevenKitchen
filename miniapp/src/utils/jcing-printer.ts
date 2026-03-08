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
   * @param imageBase64 图片的base64编码（不含前缀）
   * @param count 打印份数
   * @param canvasId 画布组件ID（精臣SDK必需参数）
   * @param component 画布组件实例（精臣SDK必需参数）
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

    // 验证必需参数
    if (!canvasId || !component) {
      throw new Error('打印图片需要提供 canvasId 和 component 参数')
    }

    console.log('[JCPrinter] 开始图片打印任务, 份数:', count);

    return new Promise((resolve, reject) => {
      let completed = false;
      let jobStarted = false;
      let imageCached = false;

      // 注册打印错误监听器（用于诊断）
      JCAPI.didReadPrintErrorInfo((errorInfo: any) => {
        console.error('[JCPrinter] 打印机返回错误:', errorInfo);
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          reject(new Error(`打印机错误: ${JSON.stringify(errorInfo)}`));
        }
      });

      // 注册打印进度监听器（用于诊断）
      JCAPI.didReadPrintCountInfo((countInfo: any) => {
        console.log('[JCPrinter] 打印进度:', countInfo);
      });

      // 超时保护：15秒后自动完成（增加超时时间)
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          if (imageCached) {
            console.warn('[JCPrinter] 打印超时,但图片已缓存,打印可能正在进行');
            resolve();
          } else if (jobStarted) {
            console.warn('[JCPrinter] 打印任务已启动但超时');
            resolve();
          } else {
            console.error('[JCPrinter] 打印任务启动失败（startJob回调未触发）');
            reject(new Error('打印任务启动超时'));
          }
        }
      }, 15000);

      console.log('[JCPrinter] 步骤1: 调用 startJob, totalCount=' + count);
      // 1. 开始打印任务
      // gapType: 1=间隙纸, darkness: 3=浓度, totalCount: 总打印份数
      JCAPI.startJob(1, 3, count, () => {
        jobStarted = true;
        console.log('[JCPrinter] 步骤2: startJob 回调触发,开始缓存图片');
        // 2. 使用printImage缓存图片数据
        // 重要: printImage 的 count 参数应该始终为 1（只缓存一张图片）
        // 打印份数由 print() 方法控制
        // 关键修复: 当使用 base64 数据时,不需要 canvasId 和 compent 参数
        // 重要: sWidth 和 sHeight 必须设置，否则打印区域为0，导致空白打印
        const printImageParams: any = {
          data: imageBase64,
          count: 1,        // 关键修复: 始终为1,只缓存一张图片
          width: 75,       // 标签宽度 75mm
          height: 100,     // 标签高度 100mm
          sWidth: 75,      // 打印区域宽度 75mm - 必需！
          sHeight: 100,    // 打印区域高度 100mm - 必需！
          orientation: 0,
          success: () => {
            imageCached = true;
            console.log('[JCPrinter] 步骤3: 图片缓存成功');

            // 关键修复: 在调用 print 之前增加 300ms 延迟
            // 让打印机有时间处理缓存的数据
            console.log('[JCPrinter] 步骤4: 等待 300ms 后调用 print...');
            setTimeout(() => {
              console.log('[JCPrinter] 步骤5: 调用 print, onePageCount=' + count);

              // 3. 启动打印
              // print 的参数 onePageCount 表示打印当前页的份数
              JCAPI.print(count, () => {
                // 注意：根据精臣SDK文档,仅打印一页一份时此回调不会触发
                console.log('[JCPrinter] 步骤6: print 回调触发(多份打印或特殊情况)');
                if (!completed) {
                  completed = true;
                  clearTimeout(timeoutId);
                  console.log('[JCPrinter] ✓ 打印完成(通过print回调)');
                  resolve();
                }
              });

              // 由于打印1份时 print 回调不会触发,需要通过延时来完成
              // 增加到5秒,给打印机足够时间
              setTimeout(() => {
                if (!completed) {
                  completed = true;
                  clearTimeout(timeoutId);
                  console.log('[JCPrinter] ✓ 打印指令已发送,等待打印机出纸');
                  resolve();
                }
              }, 5000);
            }, 300);  // 关键: 300ms 延迟
          },
          fail: (error: any) => {
            console.error('[JCPrinter] 图片缓存失败:', error);
            if (!completed) {
              completed = true;
              clearTimeout(timeoutId);
              const errMsg = error?.errMsg || error?.message || JSON.stringify(error);
              reject(new Error(`图片缓存失败: ${errMsg}`));
            }
          }
        };

        // 如果提供了 canvasId 和 component，则添加到参数中
        if (canvasId && component) {
          printImageParams.canvasId = canvasId;
          printImageParams.compent = component;
        }

        console.log('[JCPrinter] printImage 参数:', JSON.stringify({
          hasData: !!imageBase64,
          dataLength: imageBase64?.length,
          canvasId: canvasId,
          hasComponent: !!component,
          count: 1,
          width: 75,
          height: 100
        }));

        JCAPI.printImage(printImageParams);
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

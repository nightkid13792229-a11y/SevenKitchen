/**
 * Canvas打印构建器 - 用于生成DIY制作单图片
 * A4纸规格：1200px × 1697px (@150dpi)
 */

export interface PrintCanvasOptions {
  canvasId: string
  width: number
  height: number
  outputScale?: number
  /**
   * 高度自适应模式：调用方会先量内容高度再定画布尺寸。
   * 此时不做「内容快到底就压缩间距」的兜底 —— 那会让两次绘制的排版不一致。
   */
  autoHeight?: boolean
}

export interface CanvasImageInfo {
  path: string
  width?: number
  height?: number
}

export class PrintCanvasBuilder {
  private ctx: UniApp.CanvasContext
  private canvasId: string
  private canvasWidth: number
  private canvasHeight: number
  private outputScale: number
  private outputWidth: number
  private outputHeight: number
  private currentY: number = 0
  private pagePadding: number = 40
  private autoHeight: boolean = false
  /** 头部高度：信息卡向上叠压它，做出悬浮的海报感 */
  private heroHeight: number = 0

  // 字体大小配置（优化版）
  private readonly FONT_SIZES = {
    TITLE: 36,          // 大标题
    SECTION_TITLE: 26,  // 区块标题
    TEXT: 18,           // 正文
    NORMAL: 16,         // 普通文字
    SMALL: 14,          // 小字
    FOOTER: 14          // 页脚
  }

  // 颜色配置
  private readonly COLORS = {
    TITLE: '#1a1a1a',
    TEXT: '#4a4a4a',
    BORDER: '#e5e8d4',
    BACKGROUND: '#f5f5f5',
    WHITE: '#ffffff'
  }

  // 间距配置（优化版）
  private readonly SPACING = {
    SECTION_MARGIN: 40,
    ROW_HEIGHT: 25,
    TABLE_HEADER_HEIGHT: 40,
    TABLE_ROW_HEIGHT: 35,
    PADDING: 20,
    LINE_HEIGHT: 1.5
  }

  constructor(options: PrintCanvasOptions) {
    this.canvasId = options.canvasId
    this.ctx = uni.createCanvasContext(this.canvasId)
    this.canvasWidth = options.width
    this.canvasHeight = options.height
    this.outputScale = options.outputScale || 1
    this.autoHeight = options.autoHeight === true
    this.outputWidth = Math.round(this.canvasWidth * this.outputScale)
    this.outputHeight = Math.round(this.canvasHeight * this.outputScale)

    if (this.outputScale !== 1) {
      this.ctx.scale(this.outputScale, this.outputScale)
    }

    console.log('[PrintCanvas] Canvas初始化:', {
      width: this.canvasWidth,
      height: this.canvasHeight,
      outputScale: this.outputScale,
      outputSize: `${this.outputWidth}x${this.outputHeight}`,
      orientation: this.canvasHeight > this.canvasWidth ? '竖版' : '横版'
    })

    // 设置白色背景
    this.drawBackground()
  }

  /** 圆角矩形路径（画完需自行 fill / stroke） */
  private roundRect(x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.max(0, Math.min(r, w / 2, h / 2))
    this.ctx.beginPath()
    this.ctx.moveTo(x + radius, y)
    this.ctx.lineTo(x + w - radius, y)
    this.ctx.arc(x + w - radius, y + radius, radius, -Math.PI / 2, 0)
    this.ctx.lineTo(x + w, y + h - radius)
    this.ctx.arc(x + w - radius, y + h - radius, radius, 0, Math.PI / 2)
    this.ctx.lineTo(x + radius, y + h)
    this.ctx.arc(x + radius, y + h - radius, radius, Math.PI / 2, Math.PI)
    this.ctx.lineTo(x, y + radius)
    this.ctx.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5)
    this.ctx.closePath()
  }

  /**
   * 绘制白色背景
   */
  private drawBackground() {
    this.ctx.setFillStyle(this.COLORS.WHITE)
    this.ctx.fillRect(0, 0, this.canvasWidth, this.canvasHeight)
  }

  /**
   * 检查是否超出画布高度
   */
  private checkOverflow(additionalHeight: number = 0) {
    // 自适应高度模式下由调用方负责把画布撑够，不做压缩兜底
    if (this.autoHeight) return

    const maxY = this.canvasHeight - 60 // 留出页脚空间
    if (this.currentY + additionalHeight > maxY) {
      console.warn('[PrintCanvas] 内容接近A4纸底部，当前Y:', this.currentY, '额外高度:', additionalHeight)

      // 如果接近底部，自动缩减当前间距
      if (this.currentY > maxY * 0.85) {
        console.log('[PrintCanvas] 自动缩减间距以适应A4纸')
        this.SPACING.SECTION_MARGIN = 15
        this.currentY -= 5
      }
    }
  }

  /**
   * 绘制标题（食谱名称）
   */

  /**
   * 绘制分享图品牌头部
   */
  drawBrandHeader(options: {
    brand: string
    logoPath?: string
    avatarPath?: string
    backgroundImage?: CanvasImageInfo
    title: string
    subtitle?: string
    /** 一句话卖点：标题下方的一行金色小字，是这张图最可分享的一句 */
    sellingPoint?: string
  }) {
    /**
     * 海报式头部。纵向按固定栅格排，避免各元素互相挤压 / 遮挡：
     *   34  ~ 92    品牌徽标胶囊
     *   150 ~ 226   狗狗头像 + 说明行
     *   296         主标题基线（在头像下方 24px 处，不再被头像压住）
     *   336         一句话卖点基线
     *   356 ~ 361   品牌金短线
     *   384         头部底边
     */
    const headerHeight = 384
    this.heroHeight = headerHeight
    this.drawBrandHeaderBackground(headerHeight, options)

    // 品牌徽标：白底胶囊 + 墨绿字。原来用半透明白，logo 在照片上几乎没有存在感
    const brandCenterX = this.canvasWidth / 2
    const logoSize = 42
    const brandGap = 10
    const brandTextWidth = Math.max(120, options.brand.length * 17)
    const badgePadX = 18
    const badgeHeight = 58
    const badgeWidth = logoSize + brandGap + brandTextWidth + badgePadX * 2
    const badgeX = brandCenterX - badgeWidth / 2
    const badgeY = 34

    this.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, badgeHeight / 2)
    this.ctx.setFillStyle('rgba(255,255,255,0.95)')
    this.ctx.fill()
    this.ctx.setStrokeStyle('rgba(255,255,255,0.85)')
    this.ctx.setLineWidth(1)
    this.ctx.stroke()

    if (options.logoPath) {
      try {
        this.ctx.drawImage(
          options.logoPath,
          badgeX + badgePadX,
          badgeY + (badgeHeight - logoSize) / 2,
          logoSize,
          logoSize
        )
      } catch (error) {
        console.warn('[PrintCanvas] 绘制品牌logo失败，继续生成文字头部:', error)
      }
    }

    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle('#1e3a2f')
    this.ctx.setFontSize(this.FONT_SIZES.NORMAL + 4)
    this.ctx.fillText(
      options.brand,
      badgeX + badgePadX + logoSize + brandGap,
      badgeY + badgeHeight / 2 + 8
    )

    // 狗狗头像 + 说明行（同一行，不与标题争位置）
    const avatarSize = 76
    const avatarX = this.pagePadding + 24
    const avatarY = 150

    if (options.avatarPath) {
      try {
        this.ctx.drawImage(options.avatarPath, avatarX, avatarY, avatarSize, avatarSize)
      } catch (error) {
        console.warn('[PrintCanvas] 绘制狗狗头像失败，使用品牌logo占位:', error)
        this.drawAvatarFallbackLogo(options.logoPath, avatarX, avatarY, avatarSize)
      }
    } else {
      this.drawAvatarFallbackLogo(options.logoPath, avatarX, avatarY, avatarSize)
    }

    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle('rgba(255,255,255,0.88)')
    this.ctx.setFontSize(this.FONT_SIZES.NORMAL)
    if (options.subtitle) {
      this.ctx.fillText(options.subtitle, avatarX + avatarSize + 20, avatarY + 52)
    }

    // 主标题：整张图最大的一行字，独占一行
    this.ctx.setFillStyle('#ffffff')
    this.ctx.setFontSize(this.FONT_SIZES.TITLE + 10)
    this.ctx.fillText(options.title, avatarX, 296)

    // 一句话卖点：与标题留出 40px，不与金线相贴
    if (options.sellingPoint) {
      this.ctx.setFillStyle('#e6d3a8')
      this.ctx.setFontSize(this.FONT_SIZES.NORMAL + 2)
      this.fillWrappedText(
        options.sellingPoint,
        avatarX,
        336,
        this.canvasWidth - avatarX - this.pagePadding - 24,
        22,
        1
      )
    }

    this.ctx.setFillStyle('#d8bc85')
    this.ctx.fillRect(avatarX, 356, 110, 5)

    console.log('[PrintCanvas] 海报头部绘制完成:', {
      brand: options.brand,
      title: options.title,
      heroHeight: headerHeight,
      hasSellingPoint: Boolean(options.sellingPoint)
    })
  }
  private drawBrandHeaderBackground(headerHeight: number, options: { backgroundImage?: CanvasImageInfo }) {
    let usedImage = false

    if (options.backgroundImage?.path) {
      try {
        this.drawCoverImage(options.backgroundImage, 0, 0, this.canvasWidth, headerHeight)
        usedImage = true
      } catch (error) {
        console.warn('[PrintCanvas] 绘制制作单头部背景图失败，使用默认渐变:', error)
      }
    }

    if (!usedImage) {
      const gradient = this.ctx.createLinearGradient(0, 0, this.canvasWidth, headerHeight)
      gradient.addColorStop(0, '#2b5040')
      gradient.addColorStop(0.55, '#1e3a2f')
      gradient.addColorStop(1, '#173026')
      this.ctx.setFillStyle(gradient)
      this.ctx.fillRect(0, 0, this.canvasWidth, headerHeight)
    }

    /**
     * 叠在底图上的压暗层。
     * ⚠️ 原来这里是蓝紫三层（不透明度 42%~58%），会把品牌墨绿底完全盖住。
     *    现在改成品牌墨绿，并且**上轻下重**：顶部让封面照片透出来，
     *    底部压暗保证白色标题与卖点读得清。
     *    没有底图时不再叠加（底色本身就是品牌渐变）。
     */
    if (!usedImage) {
      return
    }

    const overlayStops: Array<[number, string]> = [
      [0, 'rgba(23, 48, 38, 0.16)'],
      [0.5, 'rgba(23, 48, 38, 0.30)'],
      [1, 'rgba(20, 40, 32, 0.74)']
    ]

    const overlay = this.ctx.createLinearGradient(0, 0, this.canvasWidth, headerHeight)
    overlayStops.forEach(([offset, color]) => {
      overlay.addColorStop(offset, color)
    })
    this.ctx.setFillStyle(overlay)
    this.ctx.fillRect(0, 0, this.canvasWidth, headerHeight)
  }

  private drawCoverImage(
    image: CanvasImageInfo,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    if (!image.width || !image.height) {
      this.ctx.drawImage(image.path, x, y, width, height)
      return
    }

    const scale = Math.max(width / image.width, height / image.height)
    const sourceWidth = width / scale
    const sourceHeight = height / scale
    const sourceX = Math.max(0, (image.width - sourceWidth) / 2)
    const sourceY = Math.max(0, (image.height - sourceHeight) / 2)

    ;(this.ctx.drawImage as any)(
      image.path,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      x,
      y,
      width,
      height
    )
  }

  private drawAvatarFallbackLogo(logoPath: string | undefined, x: number, y: number, size: number) {
    const centerX = x + size / 2
    const centerY = y + size / 2

    // 品牌logo头像占位
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, size / 2 + 6, 0, Math.PI * 2)
    this.ctx.setFillStyle('rgba(255,255,255,0.9)')
    this.ctx.fill()
    this.ctx.setStrokeStyle('rgba(255,255,255,0.95)')
    this.ctx.setLineWidth(3)
    this.ctx.stroke()

    if (logoPath) {
      try {
        const logoPadding = 8
        this.ctx.drawImage(
          logoPath,
          x + logoPadding,
          y + logoPadding,
          size - logoPadding * 2,
          size - logoPadding * 2
        )
        return
      } catch (error) {
        console.warn('[PrintCanvas] 绘制品牌logo头像占位失败，使用默认头像:', error)
      }
    }

    this.drawSchnauzerAvatarPlaceholder(x, y, size)
  }

  private drawSchnauzerAvatarPlaceholder(x: number, y: number, size: number) {
    const centerX = x + size / 2
    const centerY = y + size / 2

    // 头像徽章
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, size / 2 + 6, 0, Math.PI * 2)
    this.ctx.setFillStyle('rgba(255,255,255,0.9)')
    this.ctx.fill()
    this.ctx.setStrokeStyle('rgba(255,255,255,0.95)')
    this.ctx.setLineWidth(3)
    this.ctx.stroke()

    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, size / 2 - 2, 0, Math.PI * 2)
    this.ctx.setFillStyle('#f7fbff')
    this.ctx.fill()

    // 耳朵
    this.ctx.setFillStyle('#9aa7b4')
    this.ctx.beginPath()
    this.ctx.arc(x + 18, y + 38, 15, Math.PI * 0.55, Math.PI * 1.55)
    this.ctx.lineTo(x + 24, y + 56)
    this.ctx.fill()

    this.ctx.beginPath()
    this.ctx.arc(x + size - 18, y + 38, 15, Math.PI * 1.45, Math.PI * 0.45)
    this.ctx.lineTo(x + size - 24, y + 56)
    this.ctx.fill()

    // 头部
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY + 1, size / 2 - 8, 0, Math.PI * 2)
    this.ctx.setFillStyle('#e8eef4')
    this.ctx.fill()

    // 简化毛发
    this.ctx.setFillStyle('#cdd7e1')
    this.ctx.fillRect(x + 27, y + 14, 6, 21)
    this.ctx.fillRect(x + 36, y + 11, 7, 24)
    this.ctx.fillRect(x + 46, y + 14, 6, 21)

    // 眼睛
    this.ctx.setFillStyle('#252a30')
    this.ctx.beginPath()
    this.ctx.arc(x + 29, y + 39, 4, 0, Math.PI * 2)
    this.ctx.fill()
    this.ctx.beginPath()
    this.ctx.arc(x + size - 29, y + 39, 4, 0, Math.PI * 2)
    this.ctx.fill()

    // 鼻子
    this.ctx.setFillStyle('#252a30')
    this.ctx.beginPath()
    this.ctx.arc(centerX, y + 50, 6, 0, Math.PI * 2)
    this.ctx.fill()

    // 微笑嘴巴
    this.ctx.setStrokeStyle('#2f3337')
    this.ctx.setLineWidth(3)
    this.ctx.beginPath()
    this.ctx.arc(centerX, y + 52, 12, Math.PI * 0.18, Math.PI * 0.82)
    this.ctx.stroke()

    // 项圈
    this.ctx.setStrokeStyle('#ff8f70')
    this.ctx.setLineWidth(3)
    this.ctx.beginPath()
    this.ctx.moveTo(centerX - 12, y + 67)
    this.ctx.lineTo(centerX + 12, y + 67)
    this.ctx.stroke()
  }


  /**
   * 「标签 + 数值」信息卡：区块标题 + 三列网格。
   * 与制作单页面的「狗狗信息 / 制作信息」同一套视觉（浅绿底格子 + 灰标签 + 墨绿数值）。
   */
  drawFactCards(
    title: string,
    items: Array<{ label: string; value: string }>,
    options?: { columns?: number }
  ) {
    if (!items || items.length === 0) return

    const cols = options?.columns || 3
    const gap = 8
    const tableWidth = this.canvasWidth - this.pagePadding * 2
    const cellWidth = (tableWidth - gap * (cols - 1)) / cols
    const cellHeight = 62
    const rows = Math.ceil(items.length / cols)
    const cardPadY = 16
    const cardHeight = rows * cellHeight + (rows - 1) * gap + cardPadY * 2

    // 海报式处理：白卡向上叠压头部一点点，做出悬浮层次
    const overlap = 36
    const cardY = this.heroHeight > 0 ? this.heroHeight - overlap : this.currentY + 6
    this.heroHeight = 0

    this.roundRect(this.pagePadding, cardY, tableWidth, cardHeight, 20)
    this.ctx.setFillStyle('#ffffff')
    this.ctx.fill()
    this.ctx.setStrokeStyle('#e8ebdb')
    this.ctx.setLineWidth(1)
    this.ctx.stroke()

    const gridY = cardY + cardPadY

    if (title) {
      this.ctx.setTextAlign('left')
      this.ctx.setFillStyle('#26261f')
      this.ctx.setFontSize(this.FONT_SIZES.NORMAL + 5)
      this.ctx.fillText(title, this.pagePadding + 20, gridY + 16)
    }

    items.forEach((item, index) => {
      const row = Math.floor(index / cols)
      const col = index % cols
      const x = this.pagePadding + 14 + col * (cellWidth + gap)
      const y = gridY + row * (cellHeight + gap)

      this.roundRect(x, y, cellWidth - 12, cellHeight, 12)
      this.ctx.setFillStyle('#f4f7ec')
      this.ctx.fill()

      this.ctx.setTextAlign('center')
      this.ctx.setFillStyle('#1e3a2f')
      this.ctx.setFontSize(this.FONT_SIZES.NORMAL + 4)
      this.ctx.fillText(item.value, x + (cellWidth - 12) / 2, y + 27)

      this.ctx.setFillStyle('#9aa189')
      this.ctx.setFontSize(this.FONT_SIZES.SMALL - 1)
      this.ctx.fillText(item.label, x + (cellWidth - 12) / 2, y + 49)
    })

    this.currentY = cardY + cardHeight + 34
  }
  /**
   * 区块下方的说明小字
   */
  drawNote(text: string) {
    if (!text) return

    this.currentY += 4
    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle('#968f6d')
    this.ctx.setFontSize(this.FONT_SIZES.SMALL - 1)
    this.fillWrappedText(text, this.pagePadding, this.currentY + 16, this.canvasWidth - this.pagePadding * 2, 20, 2)
    this.currentY += 30
  }

  /**
   * 绘制区块标题
   */
  drawSectionTitle(title: string) {
    this.currentY += this.SPACING.SECTION_MARGIN
    this.checkOverflow(50)

    this.ctx.setFillStyle('#b08d4f')
    this.ctx.fillRect(this.pagePadding, this.currentY + 2, 6, 24)

    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle('#1e3a2f')
    this.ctx.setFontSize(this.FONT_SIZES.SECTION_TITLE)
    this.ctx.fillText(title, this.pagePadding + 18, this.currentY + 24)

    this.currentY += 54
  }
  /**
   * 绘制标签行
   */

  /**
   * 绘制信息卡片（8列横向布局）
   */

  /**
   * 绘制表格
   */
  drawTable(headers: string[], rows: string[][], options?: {
    showTotal?: boolean
    totalText?: string
    totalValue?: string
    totalRow?: string[]
    colWidths?: number[]  // 列宽配置（像素）
    wrapColumns?: boolean[]  // 哪些列支持换行
  }) {
    this.currentY += 10
    const tableWidth = this.canvasWidth - this.pagePadding * 2
    const colCount = headers.length
    const headerHeight = this.SPACING.TABLE_HEADER_HEIGHT
    const baseRowHeight = this.SPACING.TABLE_ROW_HEIGHT

    // 计算列宽
    let colWidths: number[]
    if (options?.colWidths && options.colWidths.length === colCount) {
      colWidths = options.colWidths
    } else {
      const avgWidth = tableWidth / colCount
      colWidths = new Array(colCount).fill(avgWidth)
    }

    // 不限制行数，显示所有数据
    const displayRows = rows

    // 支持换行的列
    const wrapColumns = options?.wrapColumns || []

    this.checkOverflow(headerHeight + baseRowHeight * displayRows.length + 20)

    // 绘制表头
    this.ctx.setFillStyle('#f2f4ea')
    this.ctx.fillRect(this.pagePadding, this.currentY, tableWidth, headerHeight)

    this.ctx.setStrokeStyle(this.COLORS.BORDER)
    this.ctx.setLineWidth(1)
    this.ctx.strokeRect(this.pagePadding, this.currentY, tableWidth, headerHeight)

    let currentX = this.pagePadding
    headers.forEach((header, index) => {
      this.ctx.setFillStyle('#6b6653')
      this.ctx.setFontSize(this.FONT_SIZES.NORMAL - 2)
      this.ctx.setTextAlign('center')
      this.ctx.fillText(header, currentX + colWidths[index] / 2, this.currentY + 26)
      currentX += colWidths[index]
    })

    this.currentY += headerHeight

    // 绘制表格行
    displayRows.forEach((row, rowIndex) => {
      // 计算每行需要的最大高度（考虑换行）
      let maxLinesInRow = 1
      const lineCounts: number[] = []

      row.forEach((cell, cellIndex) => {
        if (wrapColumns[cellIndex]) {
          const colWidth = colWidths[cellIndex] - 20  // 减去左右padding
          const fontSize = this.FONT_SIZES.NORMAL - 2
          const charWidth = fontSize * 0.6  // 估算字符宽度
          const maxChars = Math.floor(colWidth / charWidth)
          const lines = Math.ceil(cell.length / maxChars)
          lineCounts.push(lines)
          maxLinesInRow = Math.max(maxLinesInRow, lines)
        } else {
          lineCounts.push(1)
        }
      })

      // 动态行高
      const lineHeight = (this.FONT_SIZES.NORMAL - 2) * 1.4
      const rowHeight = Math.max(baseRowHeight, maxLinesInRow * lineHeight + 20)

      this.ctx.setStrokeStyle(this.COLORS.BORDER)
      this.ctx.setLineWidth(0.5)
      this.ctx.strokeRect(this.pagePadding, this.currentY, tableWidth, rowHeight)

      currentX = this.pagePadding
      row.forEach((cell, cellIndex) => {
        this.ctx.setFillStyle(this.COLORS.TEXT)
        this.ctx.setFontSize(this.FONT_SIZES.NORMAL - 2)

        if (wrapColumns[cellIndex] && lineCounts[cellIndex] > 1) {
          // 支持换行
          this.ctx.setTextAlign('left')
          const colWidth = colWidths[cellIndex] - 20
          const fontSize = this.FONT_SIZES.NORMAL - 2
          const charWidth = fontSize * 0.6
          const maxChars = Math.floor(colWidth / charWidth)

          const lines = this.wrapTableCellText(cell, maxChars)
          lines.forEach((line, lineIndex) => {
            this.ctx.fillText(line, currentX + 10, this.currentY + 20 + lineIndex * lineHeight)
          })
        } else {
          // 不换行，居中显示
          this.ctx.setTextAlign('center')
          let displayText = cell
          if (cell.length > 8 && cellIndex === 0) {
            displayText = cell.substring(0, 8) + '..'
          }
          this.ctx.fillText(displayText, currentX + colWidths[cellIndex] / 2, this.currentY + rowHeight / 2 + 6)
        }

        currentX += colWidths[cellIndex]
      })

      this.currentY += rowHeight
    })

    // 绘制合计行（如果有）
    if (options?.totalRow && options.totalRow.length === colWidths.length) {
      this.ctx.setFillStyle('#f6efe0')
      this.ctx.fillRect(this.pagePadding, this.currentY, tableWidth, baseRowHeight)

      this.ctx.setFillStyle('#a97c33')
      this.ctx.setFontSize(this.FONT_SIZES.TEXT)

      currentX = this.pagePadding
      options.totalRow.forEach((cell, cellIndex) => {
        this.ctx.setTextAlign('center')
        this.ctx.fillText(cell, currentX + colWidths[cellIndex] / 2, this.currentY + baseRowHeight / 2 + 6)
        currentX += colWidths[cellIndex]
      })

      this.currentY += baseRowHeight
    } else if (options?.showTotal && options.totalText && options.totalValue) {
      this.ctx.setFillStyle('#f6efe0')
      this.ctx.fillRect(this.pagePadding, this.currentY, tableWidth, baseRowHeight)

      this.ctx.setFillStyle('#a97c33')
      this.ctx.setFontSize(this.FONT_SIZES.TEXT)
      this.ctx.setTextAlign('center')

      const valueColumnIndex = colWidths.length - 1
      let currentX = this.pagePadding
      for (let i = 0; i < colWidths.length; i++) {
        if (i === 0) {
          this.ctx.fillText(options.totalText, currentX + colWidths[i] / 2, this.currentY + baseRowHeight / 2 + 6)
        } else if (i === valueColumnIndex) {
          this.ctx.fillText(options.totalValue, currentX + colWidths[i] / 2, this.currentY + baseRowHeight / 2 + 6)
        } else {
          this.ctx.fillText('-', currentX + colWidths[i] / 2, this.currentY + baseRowHeight / 2 + 6)
        }
        currentX += colWidths[i]
      }

      this.currentY += baseRowHeight
    }

    this.currentY += 15
  }

  /**
   * 绘制制作流程（多行文本）
   */
  drawProductionSteps(steps: string) {
    if (!steps) return

    this.currentY += 10
    const cardWidth = this.canvasWidth - this.pagePadding * 2
    const font = this.FONT_SIZES.NORMAL + 1
    const lineHeight = font * 1.6
    const stepGap = 14
    const maxChars = Math.floor((cardWidth - 96) / (font * 0.62))

    // 拆成一条条步骤：优先按换行/序号拆，拆不开就当一段
    const rawParts = steps
      .split(/\n+/)
      .map(part => part.replace(/^[\s①-⑳\d.、)]+/, '').trim())
      .filter(Boolean)
    const parts = rawParts.length > 0 ? rawParts : [steps.trim()]

    parts.forEach((part, index) => {
      const lines = this.wrapText(part, maxChars)
      const stepHeight = Math.max(52, lines.length * lineHeight + 26)

      this.roundRect(this.pagePadding, this.currentY, cardWidth, stepHeight, 14)
      this.ctx.setFillStyle(index % 2 === 0 ? '#f7f9f1' : '#ffffff')
      this.ctx.fill()

      // 编号圆点
      const dotX = this.pagePadding + 34
      const dotY = this.currentY + 30
      this.ctx.beginPath()
      this.ctx.arc(dotX, dotY, 15, 0, Math.PI * 2)
      this.ctx.setFillStyle('#1e3a2f')
      this.ctx.fill()
      this.ctx.setTextAlign('center')
      this.ctx.setFillStyle('#d8bc85')
      this.ctx.setFontSize(this.FONT_SIZES.SMALL + 1)
      this.ctx.fillText(String(index + 1), dotX, dotY + 6)

      this.ctx.setTextAlign('left')
      this.ctx.setFillStyle('#3c4a3f')
      this.ctx.setFontSize(font)
      lines.forEach((line, lineIndex) => {
        this.ctx.fillText(line, this.pagePadding + 62, this.currentY + 30 + lineIndex * lineHeight)
      })

      this.currentY += stepHeight + stepGap
    })

    this.currentY += 6
  }
  /**
   * 绘制提示卡片（3个横向排列）
   */


  drawSupplementNotice(text: string) {
    this.currentY += 8
    const noticeX = this.pagePadding
    const noticeWidth = this.canvasWidth - this.pagePadding * 2
    const noticeHeight = 58

    this.ctx.setFillStyle('#fff8e8')
    this.ctx.fillRect(noticeX, this.currentY, noticeWidth, noticeHeight)
    this.ctx.setStrokeStyle('#f2d08c')
    this.ctx.strokeRect(noticeX, this.currentY, noticeWidth, noticeHeight)

    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle('#7b5b1f')
    this.ctx.setFontSize(this.FONT_SIZES.SMALL)
    this.fillWrappedText(text, noticeX + 14, this.currentY + 24, noticeWidth - 28, 18, 2)

    this.currentY += noticeHeight + 12
  }

  /**
   * 绘制分隔线
   */
  private drawDivider() {
    this.currentY += 5
    this.ctx.setStrokeStyle(this.COLORS.BORDER)
    this.ctx.setLineWidth(1)
    this.ctx.moveTo(this.pagePadding, this.currentY)
    this.ctx.lineTo(this.canvasWidth - this.pagePadding, this.currentY)
    this.ctx.stroke()
    this.currentY += 10
  }

  /**
   * 绘制页脚
   */
  drawFooter(text: string) {
    const lineY = this.canvasHeight - 62
    this.ctx.setStrokeStyle('#e5e8d4')
    this.ctx.setLineWidth(1)
    this.ctx.beginPath()
    this.ctx.moveTo(this.pagePadding, lineY)
    this.ctx.lineTo(this.canvasWidth - this.pagePadding, lineY)
    this.ctx.stroke()

    this.currentY = this.canvasHeight - 34
    this.ctx.setFillStyle('#9aa189')
    this.ctx.setFontSize(this.FONT_SIZES.FOOTER)
    this.ctx.setTextAlign('center')
    this.ctx.fillText(text, this.canvasWidth / 2, this.currentY)

    console.log('[PrintCanvas] 页脚绘制完成:', { text, y: this.currentY })
  }
  /**
   * 文本换行处理
   */
  private wrapText(text: string, maxCharsPerLine: number): string[] {
    const lines: string[] = []
    const paragraphs = text.split('\n')

    paragraphs.forEach(paragraph => {
      for (let i = 0; i < paragraph.length; i += maxCharsPerLine) {
        lines.push(paragraph.substring(i, i + maxCharsPerLine))
      }
    })

    return lines
  }

  private fillWrappedText(
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
    maxLines: number
  ) {
    const fontSize = lineHeight * 0.78
    const maxCharsPerLine = Math.max(4, Math.floor(maxWidth / (fontSize * 0.62)))
    const lines = this.wrapText(text, maxCharsPerLine)

    lines.slice(0, maxLines).forEach((line, index) => {
      const displayLine = index === maxLines - 1 && lines.length > maxLines
        ? `${line.slice(0, Math.max(0, maxCharsPerLine - 1))}…`
        : line
      this.ctx.fillText(displayLine, x, y + index * lineHeight)
    })
  }

  /**
   * 表格单元格文本换行处理
   */
  private wrapTableCellText(text: string, maxCharsPerLine: number): string[] {
    const lines: string[] = []
    for (let i = 0; i < text.length; i += maxCharsPerLine) {
      lines.push(text.substring(i, i + maxCharsPerLine))
    }
    return lines
  }

  /**
   * 渲染Canvas并返回图片路径
   */
  async toImage(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.ctx.draw(false, () => {
        setTimeout(() => {
          uni.canvasToTempFilePath({
            canvasId: this.canvasId,
            x: 0,
            y: 0,
            width: this.outputWidth,
            height: this.outputHeight,
            destWidth: this.outputWidth,
            destHeight: this.outputHeight,
            fileType: 'png',
            quality: 1,
            success: async (res) => {
              console.log('[PrintCanvas] 图片导出成功:', res.tempFilePath)
              await this.logExportedImageInfo(res.tempFilePath)
              resolve(res.tempFilePath)
            },
            fail: (err) => {
              console.error('[PrintCanvas] 导出图片失败:', err)
              reject(err)
            }
          })
        }, 500)
      })
    })
  }

  private logExportedImageInfo(filePath: string): Promise<void> {
    return new Promise((resolve) => {
      uni.getImageInfo({
        src: filePath,
        success: (info) => {
          console.log('[PrintCanvas] 导出图片尺寸:', {
            path: filePath,
            logicalSize: `${this.canvasWidth}x${this.canvasHeight}`,
            expectedSize: `${this.outputWidth}x${this.outputHeight}`,
            actualSize: `${info.width}x${info.height}`
          })
          resolve()
        },
        fail: (err) => {
          console.warn('[PrintCanvas] 读取导出图片尺寸失败:', err)
          resolve()
        }
      })
    })
  }

  /**
   * 获取当前Y坐标（用于调试）
   */
  /**
   * 内容是否已经超出 A4 高度（canvas 不会自动分页，超出部分会被裁掉）
   */
  isContentOverflowing(): boolean {
    return this.currentY > this.canvasHeight - 40
  }

  getCurrentY(): number {
    return this.currentY
  }
}

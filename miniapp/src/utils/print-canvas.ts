/**
 * Canvas打印构建器 - 用于生成DIY制作单图片
 * A4纸规格：1200px × 1697px (@150dpi)
 */

export interface PrintCanvasOptions {
  canvasId: string
  width: number
  height: number
  outputScale?: number
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
    BORDER: '#d0d0d0',
    BACKGROUND: '#f5f5f5',
    HIGHLIGHT: '#1890ff',
    WARNING: '#faad14',
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
  drawTitle(title: string) {
    // 绘制渐变背景区域
    const headerHeight = 120
    const gradient = this.ctx.createLinearGradient(0, 0, this.canvasWidth, headerHeight)
    gradient.addColorStop(0, '#667eea')
    gradient.addColorStop(1, '#764ba2')
    this.ctx.setFillStyle(gradient)
    this.ctx.fillRect(0, 0, this.canvasWidth, headerHeight)

    // 绘制标题文字
    this.ctx.setTextAlign('center')
    this.ctx.setFillStyle('#ffffff')
    this.ctx.setFontSize(this.FONT_SIZES.TITLE)
    this.ctx.fillText(title, this.canvasWidth / 2, 60)

    this.currentY = headerHeight + 20

    console.log('[PrintCanvas] 标题绘制完成:', { title, y: this.currentY })
  }

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
    stages?: string[]
  }) {
    const headerHeight = 230
    this.drawBrandHeaderBackground(headerHeight, options)

    const brandCenterX = this.canvasWidth / 2
    const logoSize = 56
    const brandGap = 14
    const brandTextWidth = Math.max(150, options.brand.length * 20)
    const brandStartX = brandCenterX - (logoSize + brandGap + brandTextWidth) / 2
    const brandY = 40

    this.ctx.setFillStyle('rgba(255,255,255,0.18)')
    this.ctx.fillRect(brandStartX - 18, brandY - 36, logoSize + brandGap + brandTextWidth + 36, 72)

    if (options.logoPath) {
      try {
        this.ctx.drawImage(options.logoPath, brandStartX, brandY - logoSize / 2, logoSize, logoSize)
      } catch (error) {
        console.warn('[PrintCanvas] 绘制品牌logo失败，继续生成文字头部:', error)
      }
    }

    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle('rgba(255,255,255,0.94)')
    this.ctx.setFontSize(this.FONT_SIZES.NORMAL + 6)
    this.ctx.fillText(options.brand, brandStartX + logoSize + brandGap, brandY + 8)

    const avatarSize = 78
    const avatarX = this.pagePadding + 42
    const avatarY = 92
    if (options.avatarPath) {
      try {
        this.ctx.drawImage(options.avatarPath, avatarX, avatarY, avatarSize, avatarSize)
      } catch (error) {
        console.warn('[PrintCanvas] 绘制狗狗头像失败，使用占位头像:', error)
        this.drawSchnauzerAvatarPlaceholder(avatarX, avatarY, avatarSize)
      }
    } else {
      this.drawSchnauzerAvatarPlaceholder(avatarX, avatarY, avatarSize)
    }

    const titleX = avatarX + avatarSize + 28
    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle('rgba(255,255,255,0.88)')
    this.ctx.setFontSize(this.FONT_SIZES.NORMAL)
    if (options.subtitle) {
      this.ctx.fillText(options.subtitle, titleX, 106)
    }

    this.ctx.setFillStyle('#ffffff')
    this.ctx.setFontSize(this.FONT_SIZES.TITLE + 4)
    this.ctx.fillText(options.title, titleX, 152)

    if (options.stages?.length) {
      const cardWidth = 248
      const cardHeight = 82
      const cardX = this.canvasWidth - this.pagePadding - 42 - cardWidth
      const cardY = 90
      this.ctx.setFillStyle('rgba(255,255,255,0.16)')
      this.ctx.fillRect(cardX, cardY, cardWidth, cardHeight)
      this.ctx.setStrokeStyle('rgba(255,255,255,0.22)')
      this.ctx.strokeRect(cardX, cardY, cardWidth, cardHeight)

      this.ctx.setTextAlign('left')
      this.ctx.setFillStyle('rgba(255,255,255,0.82)')
      this.ctx.setFontSize(this.FONT_SIZES.SMALL - 1)
      this.ctx.fillText('适用生命阶段', cardX + 14, cardY + 24)

      const tagGap = 8
      const tagHeight = 24
      const tagWidth = 66
      const visibleStages = options.stages.slice(0, 4)
      let currentX = cardX + 14
      visibleStages.forEach(stage => {
        this.ctx.setFillStyle('rgba(255,255,255,0.22)')
        this.ctx.fillRect(currentX, cardY + 40, tagWidth, tagHeight)
        this.ctx.setFillStyle('#ffffff')
        this.ctx.setFontSize(this.FONT_SIZES.SMALL - 1)
        this.ctx.setTextAlign('center')
        this.ctx.fillText(stage, currentX + tagWidth / 2, cardY + 57)
        currentX += tagWidth + tagGap
      })
    }

    this.currentY = headerHeight + 24

    console.log('[PrintCanvas] 分享图品牌头部绘制完成:', {
      brand: options.brand,
      title: options.title,
      y: this.currentY
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
      gradient.addColorStop(0, '#4eaff7')
      gradient.addColorStop(0.55, '#4d67d5')
      gradient.addColorStop(1, '#6c4bbb')
      this.ctx.setFillStyle(gradient)
      this.ctx.fillRect(0, 0, this.canvasWidth, headerHeight)
    }

    const overlay = this.ctx.createLinearGradient(0, 0, this.canvasWidth, headerHeight)
    overlay.addColorStop(0, 'rgba(26, 135, 219, 0.52)')
    overlay.addColorStop(0.5, 'rgba(50, 75, 173, 0.42)')
    overlay.addColorStop(1, 'rgba(88, 55, 151, 0.58)')
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

  private drawSchnauzerAvatarPlaceholder(x: number, y: number, size: number) {
    const centerX = x + size / 2
    const centerY = y + size / 2

    // 左耳
    this.ctx.setFillStyle('#b8c3ce')
    this.ctx.fillRect(x + 4, y + 18, 18, 34)

    // 右耳
    this.ctx.setFillStyle('#b8c3ce')
    this.ctx.fillRect(x + size - 22, y + 18, 18, 34)

    // 头部
    this.ctx.beginPath()
    this.ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2)
    this.ctx.setFillStyle('#edf2f6')
    this.ctx.fill()

    // 额头毛发
    this.ctx.setFillStyle('#d7e0e8')
    this.ctx.fillRect(x + 22, y + 10, 8, 24)
    this.ctx.fillRect(x + 34, y + 7, 8, 28)
    this.ctx.fillRect(x + 46, y + 10, 8, 24)

    // 眼睛
    this.ctx.setFillStyle('#252a30')
    this.ctx.beginPath()
    this.ctx.arc(x + 27, y + 34, 4, 0, Math.PI * 2)
    this.ctx.fill()
    this.ctx.beginPath()
    this.ctx.arc(x + size - 27, y + 34, 4, 0, Math.PI * 2)
    this.ctx.fill()

    // 鼻子
    this.ctx.beginPath()
    this.ctx.arc(centerX, y + 46, 6, 0, Math.PI * 2)
    this.ctx.fill()

    // 胡须
    this.ctx.setStrokeStyle('#f8fafc')
    this.ctx.setLineWidth(8)
    this.ctx.beginPath()
    this.ctx.moveTo(centerX - 18, y + 56)
    this.ctx.lineTo(centerX - 4, y + 52)
    this.ctx.lineTo(centerX, y + 57)
    this.ctx.lineTo(centerX + 4, y + 52)
    this.ctx.lineTo(centerX + 18, y + 56)
    this.ctx.stroke()

    this.ctx.setStrokeStyle('#252a30')
    this.ctx.setLineWidth(2)
    this.ctx.beginPath()
    this.ctx.moveTo(centerX, y + 52)
    this.ctx.lineTo(centerX, y + 60)
    this.ctx.stroke()
  }

  drawShareSummaryCards(options: {
    dogInfo: string
    dogSub?: string
    cycle: string
    cycleSub?: string
    packagePlan: string
    packageSub?: string
    formulaStandard: string
    formulaSource?: string
  }) {
    const gap = 12
    const cardHeight = 94
    const tableWidth = this.canvasWidth - this.pagePadding * 2
    const cardWidth = (tableWidth - gap * 3) / 4
    const cards = [
      { label: '狗狗信息', value: options.dogInfo, sub: options.dogSub },
      { label: '制作周期', value: options.cycle, sub: options.cycleSub },
      { label: '分装规格', value: options.packagePlan, sub: options.packageSub },
      {
        label: '配方依据',
        value: `营养标准 ${options.formulaStandard}`,
        sub: options.formulaSource ? `设计软件 ${options.formulaSource}` : ''
      }
    ]

    cards.forEach((card, index) => {
      const x = this.pagePadding + index * (cardWidth + gap)
      const y = this.currentY
      this.ctx.setFillStyle('#fbfdff')
      this.ctx.fillRect(x, y, cardWidth, cardHeight)
      this.ctx.setStrokeStyle('#cfe6fb')
      this.ctx.strokeRect(x, y, cardWidth, cardHeight)

      this.ctx.setTextAlign('left')
      this.ctx.setFillStyle('#6f7a84')
      this.ctx.setFontSize(this.FONT_SIZES.SMALL - 1)
      this.ctx.fillText(card.label, x + 14, y + 24)

      this.ctx.setFillStyle('#243746')
      this.ctx.setFontSize(this.FONT_SIZES.NORMAL + 1)
      this.fillWrappedText(card.value, x + 14, y + 52, cardWidth - 28, 20, 1)

      if (card.sub) {
        this.ctx.setFillStyle('#8a939b')
        this.ctx.setFontSize(this.FONT_SIZES.SMALL - 2)
        this.fillWrappedText(card.sub, x + 14, y + 78, cardWidth - 28, 16, 1)
      }
    })

    this.currentY += cardHeight + 32
  }

  /**
   * 绘制区块标题
   */
  drawSectionTitle(title: string) {
    this.currentY += this.SPACING.SECTION_MARGIN
    this.checkOverflow(50)

    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle(this.COLORS.HIGHLIGHT)
    this.ctx.setFontSize(this.FONT_SIZES.SECTION_TITLE)
    this.ctx.fillText(title, this.pagePadding, this.currentY + 20)

    this.currentY += 50
  }

  /**
   * 绘制标签行
   */
  drawTags(tags: string[]) {
    if (tags.length === 0) return

    const tagWidth = 130
    const tagHeight = 30
    const tagGap = 15
    const startX = (this.canvasWidth - (Math.min(tags.length, 6) * (tagWidth + tagGap))) / 2

    this.currentY = 85
    let currentX = startX

    tags.forEach((tag, index) => {
      if (index >= 6) return // 最多显示6个标签

      // 蓝色标签（适用阶段）或橙色标签（健康标签）
      const isBlue = index < 3
      this.ctx.setFillStyle(isBlue ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.15)')
      this.ctx.fillRect(currentX, this.currentY, tagWidth, tagHeight)

      this.ctx.setFillStyle('#ffffff')
      this.ctx.setFontSize(this.FONT_SIZES.SMALL)
      this.ctx.setTextAlign('center')
      this.ctx.fillText(tag, currentX + tagWidth / 2, this.currentY + 20)

      currentX += tagWidth + tagGap
    })

    this.currentY = 140
  }

  /**
   * 绘制信息卡片（8列横向布局）
   */
  drawInfoCard(items: Array<{ label: string; value: string }>, accentColor: string = '#1890ff') {
    this.currentY += 10
    this.checkOverflow(100)

    const cardWidth = this.canvasWidth - this.pagePadding * 2
    const cardHeight = 100
    const colWidth = cardWidth / 8

    // 背景
    this.ctx.setFillStyle(accentColor === '#1890ff' ? '#f0f9ff' : '#fff7e6')
    this.ctx.fillRect(this.pagePadding, this.currentY, cardWidth, cardHeight)

    // 左侧强调线
    this.ctx.setFillStyle(accentColor)
    this.ctx.fillRect(this.pagePadding, this.currentY, 4, cardHeight)

    items.forEach((item, index) => {
      const x = this.pagePadding + 20 + colWidth * index
      const y = this.currentY

      // 标签
      this.ctx.setFillStyle('#999999')
      this.ctx.setFontSize(this.FONT_SIZES.SMALL - 2)
      this.ctx.setTextAlign('left')
      this.ctx.fillText(item.label, x, y + 35)

      // 值
      this.ctx.setFillStyle('#333333')
      this.ctx.setFontSize(this.FONT_SIZES.NORMAL - 2)
      this.ctx.setTextAlign('left')
      this.ctx.fillText(item.value, x, y + 65)
    })

    this.currentY += cardHeight + 20
  }

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
    this.ctx.setFillStyle('#fafafa')
    this.ctx.fillRect(this.pagePadding, this.currentY, tableWidth, headerHeight)

    this.ctx.setStrokeStyle(this.COLORS.BORDER)
    this.ctx.setLineWidth(1)
    this.ctx.strokeRect(this.pagePadding, this.currentY, tableWidth, headerHeight)

    let currentX = this.pagePadding
    headers.forEach((header, index) => {
      this.ctx.setFillStyle('#666666')
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
      this.ctx.setFillStyle('#fff7e6')
      this.ctx.fillRect(this.pagePadding, this.currentY, tableWidth, baseRowHeight)

      this.ctx.setFillStyle(this.COLORS.WARNING)
      this.ctx.setFontSize(this.FONT_SIZES.TEXT)

      currentX = this.pagePadding
      options.totalRow.forEach((cell, cellIndex) => {
        this.ctx.setTextAlign('center')
        this.ctx.fillText(cell, currentX + colWidths[cellIndex] / 2, this.currentY + baseRowHeight / 2 + 6)
        currentX += colWidths[cellIndex]
      })

      this.currentY += baseRowHeight
    } else if (options?.showTotal && options.totalText && options.totalValue) {
      this.ctx.setFillStyle('#fff7e6')
      this.ctx.fillRect(this.pagePadding, this.currentY, tableWidth, baseRowHeight)

      this.ctx.setFillStyle(this.COLORS.WARNING)
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
    const cardHeight = 100

    this.checkOverflow(cardHeight)

    const cardWidth = this.canvasWidth - this.pagePadding * 2
    const lineHeight = this.FONT_SIZES.NORMAL * this.SPACING.LINE_HEIGHT

    this.ctx.setFillStyle(this.COLORS.BACKGROUND)
    this.ctx.fillRect(this.pagePadding, this.currentY, cardWidth, cardHeight)

    this.ctx.setFillStyle(this.COLORS.TEXT)
    this.ctx.setFontSize(this.FONT_SIZES.NORMAL)
    this.ctx.setTextAlign('left')

    // 简单的文本换行处理（每行最多50个字）
    const lines = this.wrapText(steps, 50)
    lines.forEach((line, index) => {
      if (index < 4) { // 最多显示4行
        this.ctx.fillText(line, this.pagePadding + 20, this.currentY + 30 + index * lineHeight)
      }
    })

    // 如果有更多行，显示省略号
    if (lines.length > 4) {
      this.ctx.fillText('...', this.pagePadding + 20, this.currentY + 30 + 4 * lineHeight)
    }

    this.currentY += cardHeight + 10
  }

  /**
   * 绘制提示卡片（3个横向排列）
   */
  drawTipsCards(tips: Array<{ title: string; content: string[] }>) {
    this.currentY += 10

    const cardWidth = (this.canvasWidth - this.pagePadding * 2 - 20) / 3
    const cardHeight = 80
    const lineHeight = this.FONT_SIZES.SMALL * this.SPACING.LINE_HEIGHT

    tips.forEach((tip, index) => {
      this.checkOverflow(cardHeight)

      const xPos = this.pagePadding + (cardWidth + 10) * index
      const yPos = this.currentY

      // 背景
      this.ctx.setFillStyle(this.COLORS.WHITE)
      this.ctx.fillRect(xPos, yPos, cardWidth, cardHeight)

      // 边框
      this.ctx.setStrokeStyle(this.COLORS.BORDER)
      this.ctx.setLineWidth(1)
      this.ctx.strokeRect(xPos, yPos, cardWidth, cardHeight)

      // 标题
      this.ctx.setFillStyle(this.COLORS.HIGHLIGHT)
      this.ctx.setFontSize(this.FONT_SIZES.NORMAL - 2)
      this.ctx.setTextAlign('left')
      this.ctx.fillText(tip.title, xPos + 10, yPos + 22)

      // 内容
      this.ctx.setFillStyle(this.COLORS.TEXT)
      this.ctx.setFontSize(this.FONT_SIZES.SMALL)
      tip.content.forEach((line, lineIndex) => {
        if (lineIndex < 2) { // 最多显示2行
          // 简单的自动换行处理
          const maxWidth = cardWidth - 20
          const charsPerLine = Math.floor(maxWidth / (this.FONT_SIZES.SMALL * 0.6))
          let displayLine = line
          if (line.length > charsPerLine) {
            displayLine = line.substring(0, charsPerLine - 1)
          }
          this.ctx.fillText(displayLine, xPos + 10, yPos + 42 + lineIndex * lineHeight)
        }
      })
    })

    this.currentY += cardHeight + 20
  }

  drawImportantTipsSection(tips: Array<{ title: string; content: string[] }>) {
    this.currentY += 28
    const sectionX = this.pagePadding
    const sectionWidth = this.canvasWidth - this.pagePadding * 2
    const sectionHeight = 176
    const cardGap = 12
    const cardWidth = (sectionWidth - 40 - cardGap * 2) / 3
    const cardHeight = 116
    const cardY = this.currentY + 50
    const tipContentY = cardY + 44
    const tipLineHeight = 15
    const tipMaxLines = [2, 2, 3]

    this.ctx.setFillStyle('#fffaf0')
    this.ctx.fillRect(sectionX, this.currentY, sectionWidth, sectionHeight)
    this.ctx.setStrokeStyle('#f2d08c')
    this.ctx.strokeRect(sectionX, this.currentY, sectionWidth, sectionHeight)

    this.ctx.setTextAlign('left')
    this.ctx.setFillStyle('#d68218')
    this.ctx.setFontSize(this.FONT_SIZES.SECTION_TITLE - 3)
    this.ctx.fillText('重要提示', sectionX + 18, this.currentY + 32)

    tips.forEach((tip, index) => {
      const xPos = sectionX + 20 + index * (cardWidth + cardGap)

      this.ctx.setFillStyle('#ffffff')
      this.ctx.fillRect(xPos, cardY, cardWidth, cardHeight)
      this.ctx.setStrokeStyle('#f1e1c2')
      this.ctx.strokeRect(xPos, cardY, cardWidth, cardHeight)

      this.ctx.setFillStyle('#38414a')
      this.ctx.setFontSize(this.FONT_SIZES.NORMAL - 1)
      this.ctx.fillText(tip.title, xPos + 12, cardY + 24)

      this.ctx.setFillStyle('#6d747b')
      this.ctx.setFontSize(this.FONT_SIZES.SMALL - 2)
      this.fillWrappedText(tip.content.join('\n'), xPos + 12, tipContentY, cardWidth - 24, tipLineHeight, tipMaxLines[index] || 2)
    })

    this.currentY += sectionHeight + 18
  }

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
    this.currentY = this.canvasHeight - 40

    this.ctx.setFillStyle(this.COLORS.TEXT)
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
  getCurrentY(): number {
    return this.currentY
  }
}

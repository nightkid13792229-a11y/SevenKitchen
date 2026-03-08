/**
 * Cover Image Service
 * Handles rendering cover title onto recipe cover images
 */

import { Injectable, Logger } from '@nestjs/common';
import { createCanvas, loadImage, registerFont } from 'canvas';
import * as path from 'path';
import * as fs from 'fs';
import { TencentCosService } from '../../infrastructure/services/tencent-cos.service';

/**
 * Cover title rendering options
 */
export interface CoverTitleOptions {
  text: string;
  fontSize?: number;
  fontColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  paddingX?: number;
  paddingY?: number;
}

@Injectable()
export class CoverImageService {
  private readonly logger = new Logger(CoverImageService.name);
  private fontsRegistered = false;

  constructor(private readonly cosService: TencentCosService) {
    this.registerFonts();
  }

  /**
   * Register Chinese fonts for canvas rendering
   */
  private registerFonts(): void {
    if (this.fontsRegistered) return;

    try {
      // Try different font paths (development vs production)
      const fontPaths = [
        // Production path
        path.join(__dirname, '../../../assets/fonts'),
        // Development path
        path.join(__dirname, '../../../src/assets/fonts'),
      ];

      let fontsPath: string | null = null;
      for (const fp of fontPaths) {
        if (fs.existsSync(fp)) {
          fontsPath = fp;
          break;
        }
      }

      if (!fontsPath) {
        this.logger.warn('Fonts directory not found, using system default font');
        this.fontsRegistered = true;
        return;
      }

      const regularFont = path.join(fontsPath, 'SourceHanSansSC-Regular.otf');
      const boldFont = path.join(fontsPath, 'SourceHanSansSC-Bold.otf');

      if (fs.existsSync(regularFont)) {
        registerFont(regularFont, { family: 'CoverTitle' });
        this.logger.log('Registered regular font for cover title');
      }

      if (fs.existsSync(boldFont)) {
        registerFont(boldFont, { family: 'CoverTitleBold' });
        this.logger.log('Registered bold font for cover title');
      }

      this.fontsRegistered = true;
    } catch (error: any) {
      this.logger.warn(`Failed to register fonts: ${error.message}, using system default`);
      this.fontsRegistered = true;
    }
  }

  /**
   * Render title onto cover image and upload to COS
   * @param coverImageUrl Original cover image URL
   * @param title Title text to render
   * @returns New image URL with title rendered
   */
  async renderTitleOnCover(coverImageUrl: string, title: string): Promise<string> {
    this.logger.log(`Rendering title "${title}" on cover image`);

    try {
      // Download original image
      const imageBuffer = await this.downloadImage(coverImageUrl);

      // Load image and get dimensions
      const image = await loadImage(imageBuffer);
      const width = image.width;
      const height = image.height;

      // Create canvas with same dimensions
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // Draw original image
      ctx.drawImage(image, 0, 0, width, height);

      // Render title text
      this.renderTitle(ctx, title, width, height);

      // Convert to buffer
      const outputBuffer = canvas.toBuffer('image/png');

      // Upload to COS
      const result = await this.cosService.uploadImage(
        outputBuffer,
        `cover-with-title-${Date.now()}.png`,
        'recipes/covers',
      );

      this.logger.log(`Title rendered successfully, new URL: ${result.url}`);
      return result.url;
    } catch (error: any) {
      this.logger.error(`Failed to render title: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download image from URL
   */
  private async downloadImage(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Render title text on canvas
   * Uses white text with black stroke for visibility on any background
   */
  private renderTitle(
    ctx: any,
    title: string,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    // Calculate font size based on canvas dimensions (responsive)
    // For a 16:9 cover image, use about 5% of width as font size
    const fontSize = Math.round(canvasWidth * 0.045);
    const paddingX = Math.round(canvasWidth * 0.03);
    const paddingY = Math.round(canvasHeight * 0.05);
    const strokeWidth = Math.max(2, Math.round(fontSize * 0.12));

    // Set font - try to use registered font, fallback to system font
    ctx.font = `bold ${fontSize}px "CoverTitleBold", "CoverTitle", "Noto Sans CJK SC", "Source Han Sans SC", "SimHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Draw text with stroke (outline) for visibility
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    // Draw stroke
    ctx.strokeText(title, paddingX, paddingY);

    // Draw fill (white text)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(title, paddingX, paddingY);
  }

  /**
   * Check if a URL already has a title rendered (by checking if it's in our covers folder)
   * This is a simple heuristic - we could also store metadata in DB
   */
  hasTitleRendered(coverImageUrl: string): boolean {
    return coverImageUrl.includes('/recipes/covers/');
  }
}

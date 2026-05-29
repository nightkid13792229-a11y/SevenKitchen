#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <PDFKit/PDFKit.h>
#import <Vision/Vision.h>

static NSString *const DefaultVolume = @"第六版";
static NSString *const DefaultOutput = @"reports/cfct-ocr-pages.jsonl";

static void PrintUsage(void) {
  printf("Usage:\n");
  printf("  bash scripts/cfct-ocr-pages.sh --pdf /absolute/path/to/cfct.pdf --volume \"第六版 第一册\" --start-page 1 --end-page 20 --output reports/cfct-ocr-pages.jsonl [--orientation up|right|left|down]\n\n");
  printf("Output:\n");
  printf("  JSONL, one object per PDF page. Each object contains OCR observations, confidence, bounding boxes, and reconstructed line text.\n");
}

static NSString *StringOption(NSDictionary<NSString *, NSString *> *options,
                              NSString *key,
                              NSString *fallback) {
  NSString *value = options[key];
  return value.length > 0 ? value : fallback;
}

static NSInteger IntegerOption(NSDictionary<NSString *, NSString *> *options,
                               NSString *key,
                               NSInteger fallback) {
  NSString *value = options[key];
  if (value.length == 0) return fallback;
  NSInteger parsed = value.integerValue;
  return parsed > 0 ? parsed : fallback;
}

static NSDictionary<NSString *, NSString *> *ParseOptions(int argc, const char *argv[]) {
  NSMutableDictionary<NSString *, NSString *> *options = [NSMutableDictionary dictionary];

  for (int index = 1; index < argc; index += 1) {
    NSString *arg = [NSString stringWithUTF8String:argv[index]];
    if ([arg isEqualToString:@"--help"] || [arg isEqualToString:@"-h"]) {
      PrintUsage();
      exit(0);
    }

    if ([arg hasPrefix:@"--"] && index + 1 < argc) {
      NSString *next = [NSString stringWithUTF8String:argv[index + 1]];
      if (![next hasPrefix:@"--"]) {
        options[arg] = next;
        index += 1;
      }
    }
  }

  return options;
}

static NSDictionary<NSString *, NSNumber *> *BoxDictionary(CGRect box) {
  return @{
    @"x" : @(box.origin.x),
    @"y" : @(box.origin.y),
    @"width" : @(box.size.width),
    @"height" : @(box.size.height),
  };
}

static double BoxValue(NSDictionary *item, NSString *key) {
  NSDictionary *box = item[@"boundingBox"];
  NSNumber *value = box[key];
  return value == nil ? 0 : value.doubleValue;
}

static double BoxCenterY(NSDictionary *item) {
  return BoxValue(item, @"y") + BoxValue(item, @"height") / 2.0;
}

static NSComparisonResult CompareTopToBottomThenLeft(NSDictionary *left,
                                                     NSDictionary *right,
                                                     void *context) {
  double leftY = BoxCenterY(left);
  double rightY = BoxCenterY(right);
  if (fabs(leftY - rightY) > 0.012) {
    return leftY > rightY ? NSOrderedAscending : NSOrderedDescending;
  }

  double leftX = BoxValue(left, @"x");
  double rightX = BoxValue(right, @"x");
  if (leftX == rightX) return NSOrderedSame;
  return leftX < rightX ? NSOrderedAscending : NSOrderedDescending;
}

static NSString *ReconstructedLines(NSArray<NSDictionary *> *observations) {
  NSArray<NSDictionary *> *sorted = [observations sortedArrayUsingFunction:CompareTopToBottomThenLeft
                                                                  context:NULL];
  NSMutableArray<NSMutableArray<NSDictionary *> *> *rows = [NSMutableArray array];
  NSMutableArray<NSNumber *> *rowCenters = [NSMutableArray array];

  for (NSDictionary *observation in sorted) {
    double centerY = BoxCenterY(observation);
    double tolerance = MAX(0.012, BoxValue(observation, @"height") * 0.75);
    NSInteger matchedIndex = NSNotFound;

    for (NSUInteger rowIndex = 0; rowIndex < rowCenters.count; rowIndex += 1) {
      if (fabs(rowCenters[rowIndex].doubleValue - centerY) <= tolerance) {
        matchedIndex = (NSInteger)rowIndex;
        break;
      }
    }

    if (matchedIndex == NSNotFound) {
      [rows addObject:[NSMutableArray arrayWithObject:observation]];
      [rowCenters addObject:@(centerY)];
    } else {
      NSMutableArray<NSDictionary *> *row = rows[(NSUInteger)matchedIndex];
      [row addObject:observation];
      double count = (double)row.count;
      double updatedCenter = (rowCenters[(NSUInteger)matchedIndex].doubleValue * (count - 1.0) + centerY) / count;
      rowCenters[(NSUInteger)matchedIndex] = @(updatedCenter);
    }
  }

  NSMutableArray<NSString *> *lines = [NSMutableArray array];
  for (NSArray<NSDictionary *> *row in rows) {
    NSArray<NSDictionary *> *leftToRight = [row sortedArrayUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
      double leftX = BoxValue(left, @"x");
      double rightX = BoxValue(right, @"x");
      if (leftX == rightX) return NSOrderedSame;
      return leftX < rightX ? NSOrderedAscending : NSOrderedDescending;
    }];

    NSMutableArray<NSString *> *texts = [NSMutableArray array];
    for (NSDictionary *item in leftToRight) {
      NSString *text = item[@"text"];
      if (text.length > 0) [texts addObject:text];
    }

    NSString *line = [[texts componentsJoinedByString:@" "] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (line.length > 0) [lines addObject:line];
  }

  return [lines componentsJoinedByString:@"\n"];
}

static CGImageRef CreatePageImage(PDFPage *page, NSInteger pageNumber, NSInteger *imageWidth, NSInteger *imageHeight) {
  CGFloat scale = 2.5;
  CGRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
  NSInteger width = MAX(1, (NSInteger)ceil(bounds.size.width * scale));
  NSInteger height = MAX(1, (NSInteger)ceil(bounds.size.height * scale));
  NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL
                                                                     pixelsWide:width
                                                                     pixelsHigh:height
                                                                  bitsPerSample:8
                                                                samplesPerPixel:4
                                                                       hasAlpha:YES
                                                                       isPlanar:NO
                                                                 colorSpaceName:NSDeviceRGBColorSpace
                                                                    bytesPerRow:0
                                                                   bitsPerPixel:0];
  if (bitmap == nil) {
    fprintf(stderr, "Could not create bitmap for page %ld\n", (long)pageNumber);
    return NULL;
  }

  NSGraphicsContext *graphicsContext = [NSGraphicsContext graphicsContextWithBitmapImageRep:bitmap];
  [NSGraphicsContext saveGraphicsState];
  [NSGraphicsContext setCurrentContext:graphicsContext];
  CGContextRef context = graphicsContext.CGContext;
  CGContextSetRGBFillColor(context, 1, 1, 1, 1);
  CGContextFillRect(context, CGRectMake(0, 0, width, height));
  CGContextSaveGState(context);
  CGContextScaleCTM(context, scale, scale);
  CGContextTranslateCTM(context, -bounds.origin.x, -bounds.origin.y);
  [page drawWithBox:kPDFDisplayBoxMediaBox toContext:context];
  CGContextRestoreGState(context);
  [NSGraphicsContext restoreGraphicsState];

  *imageWidth = width;
  *imageHeight = height;
  CGImageRef image = bitmap.CGImage;
  return CGImageRetain(image);
}

static NSArray<NSDictionary *> *RecognizeText(CGImageRef image, NSError **error) {
  VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] initWithCompletionHandler:nil];
  request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
  request.usesLanguageCorrection = YES;
  request.minimumTextHeight = 0.004;

  if ([request respondsToSelector:@selector(setRecognitionLanguages:)]) {
    request.recognitionLanguages = @[ @"zh-Hans", @"en-US" ];
  }

  VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image
                                                                          options:@{}];
  if (![handler performRequests:@[ request ] error:error]) {
    return nil;
  }

  NSMutableArray<NSDictionary *> *observations = [NSMutableArray array];
  for (VNRecognizedTextObservation *observation in request.results) {
    VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
    if (candidate.string.length == 0) continue;

    [observations addObject:@{
      @"text" : candidate.string,
      @"confidence" : @(candidate.confidence),
      @"boundingBox" : BoxDictionary(observation.boundingBox),
    }];
  }

  return observations;
}

static CGImagePropertyOrientation ParseOrientation(NSString *value) {
  if ([value isEqualToString:@"right"]) return kCGImagePropertyOrientationRight;
  if ([value isEqualToString:@"left"]) return kCGImagePropertyOrientationLeft;
  if ([value isEqualToString:@"down"]) return kCGImagePropertyOrientationDown;
  return kCGImagePropertyOrientationUp;
}

static NSArray<NSDictionary *> *RecognizeTextWithOrientation(CGImageRef image,
                                                             CGImagePropertyOrientation orientation,
                                                             NSError **error) {
  VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] initWithCompletionHandler:nil];
  request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
  request.usesLanguageCorrection = YES;
  request.minimumTextHeight = 0.004;

  if ([request respondsToSelector:@selector(setRecognitionLanguages:)]) {
    request.recognitionLanguages = @[ @"zh-Hans", @"en-US" ];
  }

  VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image
                                                                      orientation:orientation
                                                                          options:@{}];
  if (![handler performRequests:@[ request ] error:error]) {
    return nil;
  }

  NSMutableArray<NSDictionary *> *observations = [NSMutableArray array];
  for (VNRecognizedTextObservation *observation in request.results) {
    VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
    if (candidate.string.length == 0) continue;

    [observations addObject:@{
      @"text" : candidate.string,
      @"confidence" : @(candidate.confidence),
      @"boundingBox" : BoxDictionary(observation.boundingBox),
    }];
  }

  return observations;
}

static void EnsureOutputDirectory(NSString *path, NSError **error) {
  NSString *directory = [path stringByDeletingLastPathComponent];
  if (directory.length == 0 || [directory isEqualToString:path]) return;
  [[NSFileManager defaultManager] createDirectoryAtPath:directory
                            withIntermediateDirectories:YES
                                             attributes:nil
                                                  error:error];
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSDictionary<NSString *, NSString *> *options = ParseOptions(argc, argv);
    NSString *pdfPath = StringOption(options, @"--pdf", nil);
    if (pdfPath.length == 0) {
      fprintf(stderr, "Missing required --pdf /absolute/path/to/cfct.pdf\n");
      return 1;
    }

    NSString *volume = StringOption(options, @"--volume", DefaultVolume);
    NSString *output = StringOption(options, @"--output", DefaultOutput);
    CGImagePropertyOrientation orientation = ParseOrientation(StringOption(options, @"--orientation", @"up"));
    NSURL *pdfURL = [NSURL fileURLWithPath:pdfPath];
    PDFDocument *document = [[PDFDocument alloc] initWithURL:pdfURL];
    if (document == nil) {
      fprintf(stderr, "Could not open PDF: %s\n", pdfPath.UTF8String);
      return 1;
    }

    NSInteger pageCount = document.pageCount;
    NSInteger startPage = IntegerOption(options, @"--start-page", 1);
    NSInteger endPage = IntegerOption(options, @"--end-page", pageCount);
    if (startPage < 1 || endPage < startPage || endPage > pageCount) {
      fprintf(stderr, "--start-page and --end-page must form a valid 1-based page range\n");
      return 1;
    }

    NSError *error = nil;
    EnsureOutputDirectory(output, &error);
    if (error != nil) {
      fprintf(stderr, "Could not create output directory: %s\n", error.localizedDescription.UTF8String);
      return 1;
    }

    [[NSFileManager defaultManager] createFileAtPath:output contents:nil attributes:nil];
    NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:output];
    if (handle == nil) {
      fprintf(stderr, "Could not open output file: %s\n", output.UTF8String);
      return 1;
    }

    for (NSInteger pageNumber = startPage; pageNumber <= endPage; pageNumber += 1) {
      @autoreleasepool {
        PDFPage *page = [document pageAtIndex:(NSUInteger)(pageNumber - 1)];
        if (page == nil) {
          fprintf(stderr, "Could not read PDF page %ld\n", (long)pageNumber);
          return 1;
        }

        NSInteger imageWidth = 0;
        NSInteger imageHeight = 0;
        CGImageRef image = CreatePageImage(page, pageNumber, &imageWidth, &imageHeight);
        if (image == NULL) return 1;

        NSError *ocrError = nil;
        NSArray<NSDictionary *> *observations = RecognizeTextWithOrientation(image, orientation, &ocrError);
        CGImageRelease(image);
        if (ocrError != nil || observations == nil) {
          fprintf(stderr, "OCR page %ld failed: %s\n", (long)pageNumber, ocrError.localizedDescription.UTF8String);
          return 1;
        }

        NSDictionary *pageOutput = @{
          @"sourcePdf" : pdfPath,
          @"volume" : volume,
          @"page" : @(pageNumber),
          @"imageWidth" : @(imageWidth),
          @"imageHeight" : @(imageHeight),
          @"observations" : observations,
          @"fullText" : ReconstructedLines(observations),
        };

        NSData *json = [NSJSONSerialization dataWithJSONObject:pageOutput
                                                       options:0
                                                         error:&error];
        if (json == nil || error != nil) {
          fprintf(stderr, "Could not encode OCR page %ld: %s\n", (long)pageNumber, error.localizedDescription.UTF8String);
          return 1;
        }

        [handle writeData:json];
        [handle writeData:[@"\n" dataUsingEncoding:NSUTF8StringEncoding]];
        fprintf(stderr, "OCR page %ld/%ld: %lu text blocks\n",
                (long)pageNumber,
                (long)endPage,
                (unsigned long)observations.count);
      }
    }

    [handle closeFile];
  }

  return 0;
}

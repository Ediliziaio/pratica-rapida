#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <PDFKit/PDFKit.h>
#import <Vision/Vision.h>

static int fail(NSString *message, int code) {
  NSData *data = [[message stringByAppendingString:@"\n"] dataUsingEncoding:NSUTF8StringEncoding];
  [[NSFileHandle fileHandleWithStandardError] writeData:data];
  return code;
}

static NSString *recognizeImage(CGImageRef cgImage, CGImagePropertyOrientation orientation, NSError **error) {
  VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
  request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
  request.usesLanguageCorrection = YES;
  request.recognitionLanguages = @[@"it-IT", @"en-US"];
  VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImage orientation:orientation options:@{}];
  if (![handler performRequests:@[request] error:error]) return nil;
  NSArray<VNRecognizedTextObservation *> *observations = [request.results sortedArrayUsingComparator:^NSComparisonResult(VNRecognizedTextObservation *left, VNRecognizedTextObservation *right) {
    CGFloat vertical = fabs(CGRectGetMidY(left.boundingBox) - CGRectGetMidY(right.boundingBox));
    if (vertical > 0.012) return CGRectGetMidY(left.boundingBox) > CGRectGetMidY(right.boundingBox) ? NSOrderedAscending : NSOrderedDescending;
    return CGRectGetMinX(left.boundingBox) < CGRectGetMinX(right.boundingBox) ? NSOrderedAscending : NSOrderedDescending;
  }];
  NSMutableArray<NSString *> *lines = [NSMutableArray array];
  for (VNRecognizedTextObservation *observation in observations) {
    VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
    if (candidate.string.length) [lines addObject:candidate.string];
  }
  return [lines componentsJoinedByString:@"\n"];
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 2) return fail(@"usage: apr-pdf-ocr <local-pdf-or-image>", 64);
    NSString *inputPath = [[NSString stringWithUTF8String:argv[1]] stringByStandardizingPath];
    NSString *extension = inputPath.pathExtension.lowercaseString;
    NSMutableArray<NSString *> *pages = [NSMutableArray array];
    BOOL usedOCR = NO;
    NSInteger pageCount = 0;
    if ([extension isEqualToString:@"pdf"]) {
      PDFDocument *document = [[PDFDocument alloc] initWithURL:[NSURL fileURLWithPath:inputPath]];
      if (!document) return fail(@"invalid_pdf", 65);
      pageCount = document.pageCount;
      for (NSInteger pageIndex = 0; pageIndex < document.pageCount; pageIndex++) {
        PDFPage *page = [document pageAtIndex:pageIndex];
        if (!page) return fail([NSString stringWithFormat:@"missing_page_%ld", (long)pageIndex + 1], 1);
        NSRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
        NSString *nativeText = [page selectionForRect:bounds].string ?: @"";
        NSString *compactNative = [[nativeText componentsSeparatedByCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] componentsJoinedByString:@""];
        BOOL technicalWindowPerformancePage =
          [nativeText rangeOfString:@"DICHIARAZIONE DI PRESTAZIONE" options:NSCaseInsensitiveSearch].location != NSNotFound
          && ([nativeText rangeOfString:@"Trasmittanza termica" options:NSCaseInsensitiveSearch].location != NSNotFound
            || [nativeText rangeOfString:@"Quantità" options:NSCaseInsensitiveSearch].location != NSNotFound);
        if (compactNative.length >= 40 && !technicalWindowPerformancePage) {
          [pages addObject:nativeText];
          continue;
        }
        usedOCR = YES;
        CGFloat scale = MIN(3.0, 2400.0 / MAX(bounds.size.width, bounds.size.height));
        NSSize size = NSMakeSize(MAX(1, bounds.size.width * scale), MAX(1, bounds.size.height * scale));
        NSImage *image = [page thumbnailOfSize:size forBox:kPDFDisplayBoxMediaBox];
        CGImageRef cgImage = [image CGImageForProposedRect:NULL context:nil hints:nil];
        if (!cgImage) return fail(@"render_image_failed", 1);
        NSError *error = nil;
        NSString *recognized = recognizeImage(cgImage, kCGImagePropertyOrientationUp, &error);
        if (!recognized) return fail(error.localizedDescription ?: @"ocr_failed", 1);
        if (technicalWindowPerformancePage && compactNative.length >= 40) {
          NSError *clockwiseError = nil;
          NSString *clockwise = recognizeImage(cgImage, kCGImagePropertyOrientationRight, &clockwiseError);
          if (!clockwise) return fail(clockwiseError.localizedDescription ?: @"rotated_ocr_failed", 1);
          NSError *counterclockwiseError = nil;
          NSString *counterclockwise = recognizeImage(cgImage, kCGImagePropertyOrientationLeft, &counterclockwiseError);
          if (!counterclockwise) return fail(counterclockwiseError.localizedDescription ?: @"rotated_ocr_failed", 1);
          size_t pixelWidth = CGImageGetWidth(cgImage);
          size_t pixelHeight = CGImageGetHeight(cgImage);
          CGRect diagramRect = CGRectMake(0, pixelHeight * 0.10, pixelWidth * 0.38, pixelHeight * 0.58);
          CGImageRef diagramImage = CGImageCreateWithImageInRect(cgImage, diagramRect);
          if (!diagramImage) return fail(@"diagram_crop_failed", 1);
          NSError *diagramError = nil;
          NSString *diagram = recognizeImage(diagramImage, kCGImagePropertyOrientationUp, &diagramError);
          if (!diagram) { CGImageRelease(diagramImage); return fail(diagramError.localizedDescription ?: @"diagram_ocr_failed", 1); }
          NSError *diagramClockwiseError = nil;
          NSString *diagramClockwise = recognizeImage(diagramImage, kCGImagePropertyOrientationRight, &diagramClockwiseError);
          if (!diagramClockwise) { CGImageRelease(diagramImage); return fail(diagramClockwiseError.localizedDescription ?: @"diagram_rotated_ocr_failed", 1); }
          NSError *diagramCounterclockwiseError = nil;
          NSString *diagramCounterclockwise = recognizeImage(diagramImage, kCGImagePropertyOrientationLeft, &diagramCounterclockwiseError);
          CGImageRelease(diagramImage);
          if (!diagramCounterclockwise) return fail(diagramCounterclockwiseError.localizedDescription ?: @"diagram_rotated_ocr_failed", 1);
          CGRect verticalDimensionRect = CGRectMake(pixelWidth * 0.27, pixelHeight * 0.14, pixelWidth * 0.09, pixelHeight * 0.40);
          CGImageRef verticalDimensionImage = CGImageCreateWithImageInRect(cgImage, verticalDimensionRect);
          if (!verticalDimensionImage) return fail(@"vertical_dimension_crop_failed", 1);
          NSError *verticalClockwiseError = nil;
          NSString *verticalClockwise = recognizeImage(verticalDimensionImage, kCGImagePropertyOrientationRight, &verticalClockwiseError);
          if (!verticalClockwise) { CGImageRelease(verticalDimensionImage); return fail(verticalClockwiseError.localizedDescription ?: @"vertical_dimension_ocr_failed", 1); }
          NSError *verticalCounterclockwiseError = nil;
          NSString *verticalCounterclockwise = recognizeImage(verticalDimensionImage, kCGImagePropertyOrientationLeft, &verticalCounterclockwiseError);
          CGImageRelease(verticalDimensionImage);
          if (!verticalCounterclockwise) return fail(verticalCounterclockwiseError.localizedDescription ?: @"vertical_dimension_ocr_failed", 1);
          [pages addObject:[NSString stringWithFormat:@"%@\nAPR_VISUAL_OCR:\n%@\nAPR_ROTATED_CLOCKWISE_OCR:\n%@\nAPR_ROTATED_COUNTERCLOCKWISE_OCR:\n%@\nAPR_DIAGRAM_OCR:\n%@\nAPR_DIAGRAM_ROTATED_CLOCKWISE_OCR:\n%@\nAPR_DIAGRAM_ROTATED_COUNTERCLOCKWISE_OCR:\n%@\nAPR_VERTICAL_DIMENSION_CLOCKWISE_OCR:\n%@\nAPR_VERTICAL_DIMENSION_COUNTERCLOCKWISE_OCR:\n%@", nativeText, recognized, clockwise, counterclockwise, diagram, diagramClockwise, diagramCounterclockwise, verticalClockwise, verticalCounterclockwise]];
        } else {
          [pages addObject:recognized];
        }
      }
    } else if ([extension isEqualToString:@"png"] || [extension isEqualToString:@"jpg"] || [extension isEqualToString:@"jpeg"]) {
      usedOCR = YES;
      pageCount = 1;
      NSImage *image = [[NSImage alloc] initWithContentsOfFile:inputPath];
      if (!image) return fail(@"invalid_image", 65);
      CGImageRef cgImage = [image CGImageForProposedRect:NULL context:nil hints:nil];
      if (!cgImage) return fail(@"render_image_failed", 1);
      NSError *error = nil;
      NSString *recognized = recognizeImage(cgImage, kCGImagePropertyOrientationUp, &error);
      if (!recognized) return fail(error.localizedDescription ?: @"ocr_failed", 1);
      [pages addObject:recognized];
    } else {
      return fail(@"invalid_document_format", 65);
    }
    NSDictionary *metadata = @{@"mode": usedOCR ? @"macos_vision_ocr" : @"native_text", @"pageCount": @(pageCount)};
    NSData *metadataData = [NSJSONSerialization dataWithJSONObject:metadata options:0 error:nil];
    NSString *header = [[NSString alloc] initWithData:metadataData encoding:NSUTF8StringEncoding];
    NSString *payload = [NSString stringWithFormat:@"APR_META:%@\n%@", header, [pages componentsJoinedByString:@"\n\f\n"]];
    NSData *output = [payload dataUsingEncoding:NSUTF8StringEncoding];
    [[NSFileHandle fileHandleWithStandardOutput] writeData:output];
    return 0;
  }
}

/**
 * Named values for every option that takes a fixed set of strings: `Mode.Pages` instead of `'pages'`.
 * Each is a const object plus a type of the same name, so plain strings type-check too.
 */

/** How PDFs or images reach the model (`pdf` and `images` options). */
export const Mode = {
  /** docling's text and pictures; pages docling reads unreliably go as page images */
  Docling: 'docling',
  /** every page as an image, plus docling's text on dense pages */
  Pages: 'pages',
  /** no docling: the provider reads the file itself */
  Native: 'native',
} as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

/** OpenAI image detail for photos, signatures and stamps (`imageDetail` option). */
export const ImageDetail = { Low: 'low', High: 'high', Auto: 'auto' } as const;
export type ImageDetail = (typeof ImageDetail)[keyof typeof ImageDetail];

/** docling's OCR engines (`doclingOptions.ocr_preset`). */
export const OcrPreset = { Auto: 'auto', RapidOcr: 'rapidocr', EasyOcr: 'easyocr', Tesseract: 'tesseract' } as const;
export type OcrPreset = (typeof OcrPreset)[keyof typeof OcrPreset];

/** docling's table structure model (`doclingOptions.table_mode`). */
export const TableMode = { Accurate: 'accurate', Fast: 'fast' } as const;
export type TableMode = (typeof TableMode)[keyof typeof TableMode];

/** Picture classes docling's classifier assigns (`skipClasses` option). */
export const PictureClass = {
  BarChart: 'bar_chart',
  BarCode: 'bar_code',
  BoxPlot: 'box_plot',
  CadDrawing: 'cad_drawing',
  Calendar: 'calendar',
  ChemistryMarkushStructure: 'chemistry_markush_structure',
  ChemistryMolecularStructure: 'chemistry_molecular_structure',
  ChemistryStructure: 'chemistry_structure',
  Crossword: 'crossword_puzzle',
  ElectricalDiagram: 'electrical_diagram',
  EngineeringDrawing: 'engineering_drawing',
  FlowChart: 'flow_chart',
  FullPageImage: 'full_page_image',
  GeographicalMap: 'geographical_map',
  Heatmap: 'heatmap',
  Icon: 'icon',
  LineChart: 'line_chart',
  Logo: 'logo',
  Map: 'map',
  Music: 'music',
  NaturalImage: 'natural_image',
  Other: 'other',
  OtherChart: 'other_chart',
  PageThumbnail: 'page_thumbnail',
  Photograph: 'photograph',
  PictureGroup: 'picture_group',
  PieChart: 'pie_chart',
  QrCode: 'qr_code',
  RemoteSensing: 'remote_sensing',
  ScatterChart: 'scatter_chart',
  ScatterPlot: 'scatter_plot',
  Screenshot: 'screenshot',
  ScreenshotFromComputer: 'screenshot_from_computer',
  ScreenshotFromManual: 'screenshot_from_manual',
  Signature: 'signature',
  StackedBarChart: 'stacked_bar_chart',
  Stamp: 'stamp',
  Table: 'table',
  TopographicalMap: 'topographical_map',
} as const;
export type PictureClass = (typeof PictureClass)[keyof typeof PictureClass];

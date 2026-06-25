export interface Scenario {
  id: string;
  type: 'happy_path' | 'negative' | 'security' | 'edge_case' | 'ui_state' | 'business_rule';
  title: string;
  steps: string[];
  expected: string;
}

export interface LayerPlan {
  scenarioId: string;
  layer: 'unit' | 'api' | 'component' | 'e2e';
  reason: string;
  scenario?: Scenario;
  automationPriority: "P1" | "P2" | "P3";
  manualOnly: boolean;
  pageName: string;
}

export interface TestResult {
  scenarioId?: string;
  title?: string;
  layer?: string;
  file: string;
  filePath?: string;
  pageObjectFile?: string;
  pageObjectPath?: string;
  status: 'pass' | 'fail' | 'error' | 'generated';
  passCount?: number;
  failCount?: number;
  errorLog?: string;
  code: string;
  pageObjectCode?: string;
}

export interface ReviewReport {
  overallScore: number;
  issues: { file: string; issue: string; severity: 'high' | 'medium' | 'low' }[];
  suggestions: string[];
  summary: string;
}

export interface PipelineContext {
  featureDescription: string;
  scenarios?: Scenario[];
  layerPlan?: LayerPlan[];
  testResults?: TestResult[];
  reviewReport?: ReviewReport;
}
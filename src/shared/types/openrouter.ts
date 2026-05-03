export interface ModelPricing {
  prompt: string;
  completion: string;
  [key: string]: string;
}

export interface ModelArchitecture {
  input_modalities: string[];
  output_modalities: string[];
  modality?: string;
  [key: string]: any;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  pricing: ModelPricing;
  architecture: ModelArchitecture;
}

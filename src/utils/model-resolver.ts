export interface ResolvedModel {
  service: string;
  model: string;
  fullName: string;
}

export class ModelResolver {
  /**
   * Resolves a model name to its service and full name.
   * Supports formats:
   * - "service/model" (e.g., "openai/o3-mini")
   * - "model" (e.g., "o3-mini") - will search all services
   * 
   * @param modelName The model name to resolve
   * @param config The configuration object
   * @returns The resolved model or throws an error
   */
  static async resolveModel(modelName: string, config: any): Promise<ResolvedModel> {
    // Check if model already includes service prefix
    if (modelName.includes('/')) {
      const firstSlashIndex = modelName.indexOf('/');
      const service = modelName.substring(0, firstSlashIndex);
      const model = modelName.substring(firstSlashIndex + 1);
      
      // Verify service exists and model is configured for this service
      if (config.services[service] && 
          config.services[service].models && 
          config.services[service].models.includes(model)) {
        return { service, model, fullName: modelName };
      }
      
      // If the service doesn't exist or model isn't in that service,
      // treat this as a bare model name and continue with the search below
    }
    
    // Search for model in all services
    const services = Object.keys(config.services).filter(s => s !== 'default');
    const foundIn: string[] = [];
    
    for (const service of services) {
      const serviceConfig = config.services[service];
      if (serviceConfig.models && serviceConfig.models.includes(modelName)) {
        foundIn.push(service);
      }
    }
    
    if (foundIn.length === 0) {
      // Model not found in any service
      const allModels: string[] = [];
      for (const service of services) {
        const serviceConfig = config.services[service];
        if (serviceConfig.models) {
          allModels.push(...serviceConfig.models.map((m: string) => `${service}/${m}`));
        }
      }
      
      throw new Error(
        `Model '${modelName}' not found in any configured service.\n` +
        `Available models:\n${allModels.map(m => `  - ${m}`).join('\n')}`
      );
    }
    
    if (foundIn.length > 1) {
      // Model found in multiple services - check for default service
      if (config.defaultService && foundIn.includes(config.defaultService)) {
        // Use default service to resolve ambiguity
        return { 
          service: config.defaultService, 
          model: modelName, 
          fullName: `${config.defaultService}/${modelName}` 
        };
      }
      
      // No default service or default service doesn't have this model
      throw new Error(
        `Model '${modelName}' is configured in multiple services: ${foundIn.join(', ')}.\n` +
        `Please specify the service explicitly using the format: service/model\n` +
        `For example: ${foundIn[0]}/${modelName}\n` +
        `Or set a default service using: aia config-set-default-service <service>`
      );
    }
    
    // Model found in exactly one service
    const service = foundIn[0];
    return { service, model: modelName, fullName: `${service}/${modelName}` };
  }
  
  /**
   * Resolves multiple model names, returning resolved models and errors
   */
  static async resolveModels(
    modelNames: string[], 
    config: any
  ): Promise<{ resolved: ResolvedModel[], errors: Array<{ model: string, error: string }> }> {
    const resolved: ResolvedModel[] = [];
    const errors: Array<{ model: string, error: string }> = [];
    
    for (const modelName of modelNames) {
      try {
        const result = await this.resolveModel(modelName, config);
        resolved.push(result);
      } catch (error: any) {
        errors.push({ model: modelName, error: error.message });
      }
    }
    
    return { resolved, errors };
  }
  
  /**
   * Gets the default model(s) from configuration
   */
  static getDefaultModels(config: any): string[] {
    const models: string[] = [];
    
    // Check for defaultModels array
    if (config.defaultModels && Array.isArray(config.defaultModels)) {
      models.push(...config.defaultModels);
    }
    // Check for single defaultModel
    else if (config.defaultModel) {
      models.push(config.defaultModel);
    }
    // Check for default service with single model
    else if (config.defaultService) {
      const serviceConfig = config.services[config.defaultService];
      if (serviceConfig?.models?.length === 1) {
        models.push(`${config.defaultService}/${serviceConfig.models[0]}`);
      }
    }
    
    return models;
  }
}
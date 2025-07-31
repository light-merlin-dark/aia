export interface ResolvedModel {
  service: string;
  model: string;
  fullName: string;
}

export class ModelResolver {
  /**
   * Resolves a model name to its service and full name.
   * STRICT HIERARCHY: Models must always be bound to services.
   * 
   * Supported formats:
   * - "service/model" (e.g., "openai/gpt-4", "openrouter/google/gemini-2.5-pro-preview")
   * - "model" (e.g., "gpt-4") - will use default service if configured
   * 
   * @param modelName The model name to resolve
   * @param config The configuration object
   * @returns The resolved model or throws an error
   */
  static async resolveModel(modelName: string, config: any): Promise<ResolvedModel> {
    // Case 1: Fully qualified service/model format
    if (modelName.includes('/')) {
      const firstSlashIndex = modelName.indexOf('/');
      const service = modelName.substring(0, firstSlashIndex);
      const model = modelName.substring(firstSlashIndex + 1);
      
      // Check if this is actually a service/model format by verifying service exists
      if (config.services[service]) {
        // Verify model exists in that service
        if (!config.services[service].models || !config.services[service].models.includes(model)) {
          const availableModels = config.services[service].models || [];
          throw new Error(
            `Model '${model}' not configured for service '${service}'.\n` +
            `Available models for ${service}: ${availableModels.join(', ') || 'none configured'}`
          );
        }
        
        return { service, model, fullName: modelName };
      }
      
      // If service doesn't exist, treat the entire string as a model name
      // and fall through to search all services
    }
    
    // Case 2: Bare model name - use default service if configured
    if (config.defaultService) {
      const defaultService = config.defaultService;
      
      // Verify default service exists
      if (!config.services[defaultService]) {
        throw new Error(
          `Default service '${defaultService}' not found in configuration`
        );
      }
      
      // Check if model exists in default service
      if (config.services[defaultService].models && 
          config.services[defaultService].models.includes(modelName)) {
        return {
          service: defaultService,
          model: modelName,
          fullName: `${defaultService}/${modelName}`
        };
      }
    }
    
    // Case 3: No default service or model not in default service
    // Search all services but require explicit disambiguation if found in multiple
    const services = Object.keys(config.services).filter(s => s !== 'default');
    const foundIn: string[] = [];
    
    for (const service of services) {
      const serviceConfig = config.services[service];
      if (serviceConfig.models && serviceConfig.models.includes(modelName)) {
        foundIn.push(service);
      }
    }
    
    if (foundIn.length === 0) {
      // Model not found anywhere
      const allModels: string[] = [];
      for (const service of services) {
        const serviceConfig = config.services[service];
        if (serviceConfig.models) {
          allModels.push(...serviceConfig.models.map((m: string) => `${service}/${m}`));
        }
      }
      
      throw new Error(
        `Model '${modelName}' not found in any configured service.\n` +
        `Available models:\n${allModels.map(m => `  - ${m}`).join('\n')}\n\n` +
        `Use the format: service/model (e.g., openai/${modelName})`
      );
    }
    
    if (foundIn.length > 1) {
      // Model found in multiple services - require explicit specification
      throw new Error(
        `Model '${modelName}' is configured in multiple services: ${foundIn.join(', ')}.\n` +
        `Please specify the service explicitly:\n` +
        foundIn.map(s => `  - ${s}/${modelName}`).join('\n') + '\n\n' +
        `Or set a default service: aia config-set-default-service <service>`
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
   * Gets the default model(s) from configuration.
   * STRICT HIERARCHY: Always returns fully qualified service/model names.
   */
  static getDefaultModels(config: any): string[] {
    const models: string[] = [];
    
    // Priority 1: Explicit defaultModel (resolve it properly)
    if (config.defaultModel) {
      if (config.defaultModel.includes('/')) {
        // Fully qualified - use as-is
        models.push(config.defaultModel);
      } else {
        // Bare model - find which service it belongs to
        const services = Object.keys(config.services).filter(s => s !== 'default');
        let foundService = null;
        
        for (const service of services) {
          const serviceConfig = config.services[service];
          if (serviceConfig.models && serviceConfig.models.includes(config.defaultModel)) {
            foundService = service;
            break;
          }
        }
        
        if (foundService) {
          models.push(`${foundService}/${config.defaultModel}`);
        } else {
          console.warn(`Default model '${config.defaultModel}' not found in any service. Skipping.`);
        }
      }
    }
    // Priority 2: Explicit defaultModels array (must be fully qualified)
    else if (config.defaultModels && Array.isArray(config.defaultModels)) {
      for (const model of config.defaultModels) {
        if (model.includes('/')) {
          models.push(model);
        } else if (config.defaultService) {
          models.push(`${config.defaultService}/${model}`);
        } else {
          console.warn(`Default model '${model}' is not fully qualified and no default service is set. Skipping.`);
        }
      }
    }
    // Priority 3: Use default service's first model if no explicit defaults
    else if (config.defaultService) {
      const serviceConfig = config.services[config.defaultService];
      if (serviceConfig?.models?.length > 0) {
        // Use the first model in the default service
        models.push(`${config.defaultService}/${serviceConfig.models[0]}`);
      }
    }
    
    return models;
  }
}
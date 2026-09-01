ALTER TABLE public.model_registry
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS model_identifier text,
  ADD COLUMN IF NOT EXISTS version text,
  ADD COLUMN IF NOT EXISTS architecture text,
  ADD COLUMN IF NOT EXISTS parameter_size text,
  ADD COLUMN IF NOT EXISTS recommended_ram_mb integer,
  ADD COLUMN IF NOT EXISTS context_window integer,
  ADD COLUMN IF NOT EXISTS capabilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS installed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS description text;

CREATE UNIQUE INDEX IF NOT EXISTS model_registry_identity_idx
  ON public.model_registry (tenant_id, provider, name);

-- Seed a small, provider-agnostic catalog. Remote API entries are usable now;
-- downloadable GGUF entries stay 'available' until a real runtime can install them.
INSERT INTO public.model_registry
  (tenant_id, name, display_name, provider, model_identifier, source_kind, format, quantization,
   parameter_size, size_bytes, required_ram_mb, recommended_ram_mb, context_window,
   supported_runtimes, platforms, capabilities, status, description, source_url, download_url)
VALUES
  ('tenant_main','google/gemini-3.6-flash','Gemini 3.6 Flash','lovable_gateway','google/gemini-3.6-flash','remote_api',NULL,NULL,NULL,NULL,NULL,NULL,1000000,
   ARRAY['cloud_api'],ARRAY['android','ios','web','windows'],ARRAY['general','coding','reasoning','summarization'],'ready','Cloud fallback model via Lovable AI Gateway.','https://ai.gateway.lovable.dev',NULL),
  ('tenant_main','openai/gpt-5.6-sol','GPT-5.6 Sol','lovable_gateway','openai/gpt-5.6-sol','remote_api',NULL,NULL,NULL,NULL,NULL,NULL,400000,
   ARRAY['cloud_api'],ARRAY['android','ios','web','windows'],ARRAY['general','coding','reasoning','project_generation','debugging'],'ready','Cloud reasoning model via Lovable AI Gateway.','https://ai.gateway.lovable.dev',NULL),
  ('tenant_main','qwen2.5-coder-1.5b-instruct-q4_k_m','Qwen2.5 Coder 1.5B (Q4_K_M)','local','qwen2.5-coder-1.5b-instruct','downloadable','gguf','Q4_K_M','1.5B',1120000000,2048,3072,32768,
   ARRAY['local_server','llama_cpp'],ARRAY['android','windows','linux'],ARRAY['coding','lightweight'],'available','Small coding model for on-device / local LLM server runtimes.','https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF',NULL),
  ('tenant_main','llama-3.2-1b-instruct-q4_k_m','Llama 3.2 1B Instruct (Q4_K_M)','local','llama-3.2-1b-instruct','downloadable','gguf','Q4_K_M','1B',808000000,1536,2560,8192,
   ARRAY['local_server','llama_cpp'],ARRAY['android','windows','linux'],ARRAY['general','lightweight','summarization'],'available','Very small general model suited to mobile local runtimes.','https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct',NULL),
  ('tenant_main','qwen2.5-7b-instruct-q4_k_m','Qwen2.5 7B Instruct (Q4_K_M)','local','qwen2.5-7b-instruct','downloadable','gguf','Q4_K_M','7B',4680000000,6144,8192,32768,
   ARRAY['local_server','llama_cpp'],ARRAY['windows','linux'],ARRAY['general','reasoning','coding'],'available','Mid-size model — needs a desktop-class local runtime.','https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF',NULL)
ON CONFLICT (tenant_id, provider, name) DO NOTHING;

UPDATE public.model_registry SET display_name = COALESCE(display_name, name),
  model_identifier = COALESCE(model_identifier, name),
  installed = (status IN ('installed','ready','active') AND (source_kind <> 'downloadable' OR storage_path IS NOT NULL));
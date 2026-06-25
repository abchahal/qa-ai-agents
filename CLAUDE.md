# QA AI Agents Project

## Default behaviour
When asked to run the pipeline, always use the `run_qa_pipeline` 
MCP tool with `use_input_folder: true`.
Never run `npm run pipeline` directly unless explicitly asked.

## Tools available
- run_qa_pipeline — full 4-agent pipeline
- generate_test_scenarios — Agent 1 only  
- set_feature_input — write to input/feature.md
- get_pipeline_report — read last report
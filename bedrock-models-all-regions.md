# Amazon Bedrock models, all regions

Scanned 2026-11-06 with profile `aws-bedrock` (account 083712835043). "Status" comes from real Converse calls, mostly in `us-east-1`.

## Status summary

| Status | Base models |
|---|---|
| Blocked: account being verified in that region | 2 |
| Denied (account) | 22 |
| End of life | 2 |
| Not Converse (video) | 2 |
| Not chat, not tested | 32 |
| Not tested | 1 |
| Works, no tools | 6 |
| Works, other region only | 4 |
| Works, tools OK | 56 |

## Regions

| Region | Base models | Inference profiles | Result |
|---|---:|---:|---|
| af-south-1 | 26 | 26 | Scanned |
| ap-east-2 | 34 | 34 | Scanned |
| ap-northeast-1 | 79 | 48 | Scanned |
| ap-northeast-2 | 42 | 41 | Scanned |
| ap-northeast-3 | 33 | 39 | Scanned |
| ap-south-1 | 87 | 46 | Scanned |
| ap-south-2 | 33 | 38 | Scanned |
| ap-southeast-1 | 43 | 39 | Scanned |
| ap-southeast-2 | 79 | 50 | Scanned |
| ap-southeast-3 | 57 | 35 | Scanned |
| ap-southeast-4 | 34 | 45 | Scanned |
| ap-southeast-5 | 34 | 34 | Scanned |
| ap-southeast-6 | 26 | 30 | Scanned |
| ap-southeast-7 | 34 | 34 | Scanned |
| ca-central-1 | 49 | 62 | Scanned |
| ca-west-1 | 32 | 53 | Scanned |
| eu-central-1 | 55 | 55 | Scanned |
| eu-central-2 | 34 | 45 | Scanned |
| eu-north-1 | 55 | 51 | Scanned |
| eu-south-1 | 64 | 50 | Scanned |
| eu-south-2 | 37 | 50 | Scanned |
| eu-west-1 | 72 | 58 | Scanned |
| eu-west-2 | 85 | 46 | Scanned |
| eu-west-3 | 44 | 55 | Scanned |
| eusc-de-east-1 | - | - | Separate AWS partition, your login does not apply |
| il-central-1 | 34 | 34 | Scanned |
| me-central-1 | - | - | Connection timed out from this PC |
| me-south-1 | - | - | Connection timed out from this PC |
| mx-central-1 | 26 | 26 | Scanned |
| sa-east-1 | 75 | 31 | Scanned |
| us-east-1 | 124 | 99 | Scanned |
| us-east-2 | 97 | 98 | Scanned |
| us-gov-east-1 | - | - | Separate AWS partition, your login does not apply |
| us-gov-west-1 | - | - | Separate AWS partition, your login does not apply |
| us-west-1 | 42 | 70 | Scanned |
| us-west-2 | 121 | 98 | Scanned |

## Base models (127)

Capacity-suffixed provisioned variants such as `:24k` are left out.

| Provider | Model ID | Name | Input > Output | Lifecycle | Status | Regions |
|---|---|---|---|---|---|---|
| AI21 Labs | `ai21.jamba-1-5-large-v1:0` | Jamba 1.5 Large | TEXT > TEXT | LEGACY | Works, tools OK | 1: us-east-1 |
| AI21 Labs | `ai21.jamba-1-5-mini-v1:0` | Jamba 1.5 Mini | TEXT > TEXT | LEGACY | Works, tools OK | 1: us-east-1 |
| Amazon | `amazon.nova-2-5-sonic` | Nova 2.5 Sonic | SPEECH+TEXT > SPEECH+TEXT | ACTIVE | Not chat, not tested | 4: ap-northeast-1 eu-north-1 us-east-1 us-west-2 |
| Amazon | `amazon.nova-2-lite-v1:0` | Nova 2 Lite | TEXT+IMAGE+VIDEO > TEXT | ACTIVE | Works, tools OK | 25: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 us-east-1 us-east-2 us-west-1 us-west-2 |
| Amazon | `amazon.nova-2-multimodal-embeddings-v1:0` | Amazon Nova Multimodal Embeddings | TEXT+IMAGE+AUDIO+VIDEO > EMBEDDING | ACTIVE | Not chat, not tested | 1: us-east-1 |
| Amazon | `amazon.nova-2-sonic-v1:0` | Nova 2 Sonic | SPEECH > SPEECH+TEXT | ACTIVE | Not chat, not tested | 4: ap-northeast-1 eu-north-1 us-east-1 us-west-2 |
| Amazon | `amazon.nova-lite-v1:0` | Nova Lite | TEXT+IMAGE+VIDEO > TEXT | ACTIVE | Works, tools OK | 24: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 us-east-1 us-east-2 us-west-1 us-west-2 |
| Amazon | `amazon.nova-micro-v1:0` | Nova Micro | TEXT > TEXT | ACTIVE | Works, tools OK | 20: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ap-southeast-2 ap-southeast-7 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 us-east-1 us-east-2 us-west-2 |
| Amazon | `amazon.nova-pro-v1:0` | Nova Pro | TEXT+IMAGE+VIDEO > TEXT | ACTIVE | Works, tools OK | 22: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ap-southeast-2 ap-southeast-7 ap-southeast-4 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 us-east-1 us-east-2 us-west-1 us-west-2 |
| Amazon | `amazon.rerank-v1:0` | Rerank 1.0 | TEXT > TEXT | ACTIVE | Not chat, not tested | 4: ap-northeast-1 ca-central-1 eu-central-1 us-west-2 |
| Amazon | `amazon.titan-embed-g1-text-02` | Titan Text Embeddings v2 | TEXT > EMBEDDING | ACTIVE | Not chat, not tested | 2: us-east-1 us-west-2 |
| Amazon | `amazon.titan-embed-image-v1` | Titan Multimodal Embeddings G1 | TEXT+IMAGE > EMBEDDING | ACTIVE | Not chat, not tested | 10: ap-south-1 ca-central-1 ap-southeast-2 eu-central-1 eu-west-2 eu-west-1 eu-west-3 sa-east-1 us-east-1 us-west-2 |
| Amazon | `amazon.titan-embed-image-v1:0` | Titan Multimodal Embeddings G1 | TEXT+IMAGE > EMBEDDING | ACTIVE | Not chat, not tested | 10: ap-south-1 ca-central-1 ap-southeast-2 eu-central-1 eu-west-2 eu-west-1 eu-west-3 sa-east-1 us-east-1 us-west-2 |
| Amazon | `amazon.titan-embed-text-v1` | Titan Embeddings G1 - Text | TEXT > EMBEDDING | ACTIVE | Not chat, not tested | 4: ap-northeast-1 eu-central-1 us-east-1 us-west-2 |
| Amazon | `amazon.titan-embed-text-v2:0` | Titan Text Embeddings V2 | TEXT > EMBEDDING | ACTIVE | Not chat, not tested | 19: ap-south-2 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ca-central-1 ap-southeast-2 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Anthropic | `anthropic.claude-3-5-sonnet-20240620-v1:0` | Claude 3.5 Sonnet | TEXT+IMAGE > TEXT | LEGACY | Blocked: account being verified in that region | 3: ap-southeast-1 ap-south-1 ap-northeast-2 |
| Anthropic | `anthropic.claude-3-5-sonnet-20241022-v2:0` | Claude 3.5 Sonnet v2 | TEXT+IMAGE > TEXT | LEGACY | Not tested | 3: ap-southeast-1 ap-south-1 ap-northeast-2 |
| Anthropic | `anthropic.claude-3-7-sonnet-20250219-v1:0` | Claude 3.7 Sonnet | TEXT+IMAGE > TEXT | LEGACY | Blocked: account being verified in that region | 2: ap-south-1 eu-west-2 |
| Anthropic | `anthropic.claude-3-haiku-20240307-v1:0` | Claude 3 Haiku | TEXT+IMAGE > TEXT | LEGACY | End of life | 6: ap-southeast-1 ap-south-1 ap-northeast-2 ca-central-1 eu-central-2 sa-east-1 |
| Anthropic | `anthropic.claude-3-sonnet-20240229-v1:0` | Claude 3 Sonnet | TEXT+IMAGE > TEXT | LEGACY | End of life | 5: ap-southeast-1 ap-south-1 ca-central-1 eu-west-2 sa-east-1 |
| Anthropic | `anthropic.claude-fable-5` | Claude Fable 5 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-fable-5-1` | Claude Fable 5.1 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-haiku-4-5-20251001-v1:0` | Claude Haiku 4.5 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-haiku-5-5` | Claude Haiku 5.5 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-opus-4-1-20250805-v1:0` | Claude Opus 4.1 | TEXT+IMAGE > TEXT | LEGACY | Works, tools OK | 3: us-east-1 us-east-2 us-west-2 |
| Anthropic | `anthropic.claude-opus-4-5-20251101-v1:0` | Claude Opus 4.5 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-opus-4-6-v1` | Claude Opus 4.6 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-opus-4-7` | Claude Opus 4.7 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-opus-4-8` | Claude Opus 4.8 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-opus-5` | Claude Opus 5 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-opus-5-5` | Claude Opus 5.5 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-sonnet-4-5-20250929-v1:0` | Claude Sonnet 4.5 | TEXT+IMAGE > TEXT | LEGACY | Works, tools OK | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-sonnet-4-6` | Claude Sonnet 4.6 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-sonnet-5` | Claude Sonnet 5 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Anthropic | `anthropic.claude-sonnet-5-5` | Claude Sonnet 5.5 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Cohere | `cohere.embed-english-v3` | Embed English | TEXT > EMBEDDING | ACTIVE | Not chat, not tested | 12: ap-southeast-1 ap-south-1 ap-northeast-1 ca-central-1 ap-southeast-2 eu-central-1 eu-west-2 eu-west-1 eu-west-3 sa-east-1 us-east-1 us-west-2 |
| Cohere | `cohere.embed-multilingual-v3` | Embed Multilingual | TEXT > EMBEDDING | ACTIVE | Not chat, not tested | 12: ap-southeast-1 ap-south-1 ap-northeast-1 ca-central-1 ap-southeast-2 eu-central-1 eu-west-2 eu-west-1 eu-west-3 sa-east-1 us-east-1 us-west-2 |
| Cohere | `cohere.embed-v4:0` | Embed v4 | TEXT+IMAGE > EMBEDDING | ACTIVE | Not chat, not tested | 23: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ca-central-1 ap-southeast-2 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Cohere | `cohere.rerank-v3-5:0` | Rerank 3.5 | TEXT > TEXT | ACTIVE | Not chat, not tested | 5: ap-northeast-1 ca-central-1 eu-central-1 us-east-1 us-west-2 |
| DeepSeek | `deepseek.r1-v1:0` | DeepSeek-R1 | TEXT > TEXT | ACTIVE | Works, no tools | 3: us-east-1 us-east-2 us-west-2 |
| DeepSeek | `deepseek.v3-v1:0` | DeepSeek-V3.1 | TEXT > TEXT | ACTIVE | Works, other region only | 8: ap-south-1 ap-northeast-1 ap-southeast-2 eu-north-1 eu-west-2 ap-southeast-3 us-east-2 us-west-2 |
| DeepSeek | `deepseek.v3.2` | DeepSeek V3.2 | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-north-1 eu-west-2 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Google | `google.gemma-3-12b-it` | Gemma 3 12B IT | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Google | `google.gemma-3-27b-it` | Gemma 3 27B PT | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Google | `google.gemma-3-4b-it` | Gemma 3 4B IT | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Luma AI | `luma.ray-v2:0` | Ray v2 | TEXT > VIDEO | ACTIVE | Not chat, not tested | 1: us-west-2 |
| Meta | `meta.llama3-1-70b-instruct-v1:0` | Llama 3.1 70B Instruct | TEXT > TEXT | ACTIVE | Works, tools OK | 3: us-east-1 us-east-2 us-west-2 |
| Meta | `meta.llama3-1-8b-instruct-v1:0` | Llama 3.1 8B Instruct | TEXT > TEXT | ACTIVE | Works, tools OK | 3: us-east-1 us-east-2 us-west-2 |
| Meta | `meta.llama3-3-70b-instruct-v1:0` | Llama 3.3 70B Instruct | TEXT > TEXT | ACTIVE | Works, tools OK | 3: us-east-1 us-east-2 us-west-2 |
| Meta | `meta.llama3-70b-instruct-v1:0` | Llama 3 70B Instruct | TEXT > TEXT | ACTIVE | Works, no tools | 5: ap-south-1 ca-central-1 eu-west-2 us-east-1 us-west-2 |
| Meta | `meta.llama3-8b-instruct-v1:0` | Llama 3 8B Instruct | TEXT > TEXT | ACTIVE | Works, no tools | 5: ap-south-1 ca-central-1 eu-west-2 us-east-1 us-west-2 |
| Meta | `meta.llama4-maverick-17b-instruct-v1:0` | Llama 4 Maverick 17B Instruct | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| Meta | `meta.llama4-scout-17b-instruct-v1:0` | Llama 4 Scout 17B Instruct | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| MiniMax | `minimax.minimax-m2` | MiniMax M2 | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| MiniMax | `minimax.minimax-m2.1` | MiniMax M2.1 | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| MiniMax | `minimax.minimax-m2.5` | MiniMax M2.5 | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.devstral-2-123b` | Devstral 2 123B | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.magistral-small-2509` | Magistral Small 2509 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.ministral-3-14b-instruct` | Ministral 14B 3.0 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.ministral-3-3b-instruct` | Ministral 3B | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.ministral-3-8b-instruct` | Ministral 3 8B | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.mistral-7b-instruct-v0:2` | Mistral 7B Instruct | TEXT > TEXT | ACTIVE | Works, no tools | 9: ap-south-1 ca-central-1 ap-southeast-2 eu-west-2 eu-west-1 eu-west-3 sa-east-1 us-east-1 us-west-2 |
| Mistral AI | `mistral.mistral-large-2402-v1:0` | Mistral Large (24.02) | TEXT > TEXT | ACTIVE | Works, tools OK | 9: ap-south-1 ca-central-1 ap-southeast-2 eu-west-2 eu-west-1 eu-west-3 sa-east-1 us-east-1 us-west-2 |
| Mistral AI | `mistral.mistral-large-2407-v1:0` | Mistral Large (24.07) | TEXT > TEXT | ACTIVE | Works, other region only | 1: us-west-2 |
| Mistral AI | `mistral.mistral-large-3-675b-instruct` | Mistral Large 3 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 7: ap-south-1 ap-northeast-1 ap-southeast-2 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.mistral-small-2402-v1:0` | Mistral Small (24.02) | TEXT > TEXT | ACTIVE | Works, tools OK | 1: us-east-1 |
| Mistral AI | `mistral.mixtral-8x7b-instruct-v0:1` | Mixtral 8x7B Instruct | TEXT > TEXT | ACTIVE | Works, no tools | 9: ap-south-1 ca-central-1 ap-southeast-2 eu-west-2 eu-west-1 eu-west-3 sa-east-1 us-east-1 us-west-2 |
| Mistral AI | `mistral.pixtral-large-2502-v1:0` | Pixtral Large (25.02) | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 7: eu-central-1 eu-north-1 eu-west-1 eu-west-3 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.voxtral-mini-3b-2507` | Voxtral Mini 3B 2507 | SPEECH+TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Mistral AI | `mistral.voxtral-small-24b-2507` | Voxtral Small 24B 2507 | SPEECH+TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Moonshot AI | `moonshot.kimi-k2-thinking` | Kimi K2 Thinking | TEXT > TEXT | ACTIVE | Works, tools OK | 7: ap-south-1 ap-northeast-1 ap-southeast-2 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Moonshot AI | `moonshotai.kimi-k2.5` | Kimi K2.5 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-north-1 eu-west-2 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Moonshot AI | `moonshotai.kimi-k3` | Kimi K3 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| NVIDIA | `nvidia.nemotron-nano-12b-v2` | NVIDIA Nemotron Nano 12B v2 VL BF16 | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| NVIDIA | `nvidia.nemotron-nano-3-30b` | Nemotron Nano 3 30B | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| NVIDIA | `nvidia.nemotron-nano-9b-v2` | NVIDIA Nemotron Nano 9B v2 | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| NVIDIA | `nvidia.nemotron-super-3-120b` | NVIDIA Nemotron 3 Super 120B A12B | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| OpenAI | `openai.gpt-5.4` | GPT 5.4 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-5.5` | GPT 5.5 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-5.6-luna` | GPT-5.6 Luna | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 28: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-5.6-sol` | GPT-5.6 Sol | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 28: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-5.6-terra` | GPT-5.6 Terra | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 28: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-6-astra` | GPT-6 Astra | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-6-luna` | GPT-6 Luna | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-6-sol` | GPT-6 Sol | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-6.1-sol` | GPT-6.1 Sol | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-6.1-terra` | GPT-6.1 Terra | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| OpenAI | `openai.gpt-oss-120b-1:0` | gpt-oss-120b | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| OpenAI | `openai.gpt-oss-20b-1:0` | gpt-oss-20b | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| OpenAI | `openai.gpt-oss-safeguard-120b` | GPT OSS Safeguard 120B | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| OpenAI | `openai.gpt-oss-safeguard-20b` | GPT OSS Safeguard 20B | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Qwen | `qwen.qwen3-235b-a22b-2507-v1:0` | Qwen3 235B A22B 2507 | TEXT > TEXT | ACTIVE | Works, other region only | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 ap-southeast-3 us-east-2 us-west-2 |
| Qwen | `qwen.qwen3-32b-v1:0` | Qwen3 32B (dense) | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Qwen | `qwen.qwen3-coder-30b-a3b-v1:0` | Qwen3-Coder-30B-A3B-Instruct | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Qwen | `qwen.qwen3-coder-480b-a35b-v1:0` | Qwen3 Coder 480B A35B Instruct | TEXT > TEXT | ACTIVE | Works, other region only | 8: ap-south-1 ap-northeast-1 ap-southeast-2 eu-north-1 eu-west-2 ap-southeast-3 us-east-2 us-west-2 |
| Qwen | `qwen.qwen3-coder-next` | Qwen3 Coder Next | TEXT > TEXT | ACTIVE | Works, tools OK | 3: ap-southeast-2 eu-west-2 us-east-1 |
| Qwen | `qwen.qwen3-next-80b-a3b` | Qwen3 Next 80B A3B | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Qwen | `qwen.qwen3-vl-235b-a22b` | Qwen3 VL 235B A22B | TEXT+IMAGE > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-south-1 eu-west-2 eu-west-1 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.sd3-5-large-v1:0` | Stable Diffusion 3.5 Large | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 1: us-west-2 |
| Stability AI | `stability.stable-conservative-upscale-v1:0` | Stable Image Conservative Upscale | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-creative-upscale-v1:0` | Stable Image Creative Upscale | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-fast-upscale-v1:0` | Stable Image Fast Upscale | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-control-sketch-v1:0` | Stable Image Control Sketch | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-control-structure-v1:0` | Stable Image Control Structure | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-core-v1:1` | Stable Image Core 1.0 | TEXT > IMAGE | ACTIVE | Not chat, not tested | 1: us-west-2 |
| Stability AI | `stability.stable-image-erase-object-v1:0` | Stable Image Erase Object | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-inpaint-v1:0` | Stable Image Inpaint | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-remove-background-v1:0` | Stable Image Remove Background | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-search-recolor-v1:0` | Stable Image Search and Recolor | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-search-replace-v1:0` | Stable Image Search and Replace | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-style-guide-v1:0` | Stable Image Style Guide | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-image-ultra-v1:1` | Stable Image Ultra 1.0 | TEXT > IMAGE | ACTIVE | Not chat, not tested | 1: us-west-2 |
| Stability AI | `stability.stable-outpaint-v1:0` | Stable Image Outpaint | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| Stability AI | `stability.stable-style-transfer-v1:0` | Stable Image Style Transfer | TEXT+IMAGE > IMAGE | ACTIVE | Not chat, not tested | 3: us-east-1 us-east-2 us-west-2 |
| TwelveLabs | `twelvelabs.marengo-embed-2-7-v1:0` | Marengo Embed v2.7 | TEXT+IMAGE+SPEECH+VIDEO > EMBEDDING | LEGACY | Not chat, not tested | 3: ap-northeast-2 eu-west-1 us-east-1 |
| TwelveLabs | `twelvelabs.marengo-embed-3-0-v1:0` | Marengo Embed 3.0 | TEXT+IMAGE+SPEECH+VIDEO > EMBEDDING | LEGACY | Not chat, not tested | 3: ap-northeast-2 eu-west-1 us-east-1 |
| TwelveLabs | `twelvelabs.pegasus-1-2-v1:0` | Pegasus v1.2 | TEXT+VIDEO > TEXT | LEGACY | Not Converse (video) | 30: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| TwelveLabs | `twelvelabs.pegasus-1-5-v1:0` | Pegasus v1.5 | TEXT+VIDEO > TEXT | ACTIVE | Not Converse (video) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Writer | `writer.palmyra-vision-7b` | Writer Palmyra Vision 7B | TEXT+IMAGE > TEXT | ACTIVE | Works, no tools | 3: us-east-1 us-east-2 us-west-2 |
| Writer | `writer.palmyra-x4-v1:0` | Palmyra X4 | TEXT > TEXT | LEGACY | Works, tools OK | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| Writer | `writer.palmyra-x5-v1:0` | Palmyra X5 | TEXT > TEXT | LEGACY | Works, tools OK | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| xAI | `xai.grok-4.6` | Grok 4.6 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 28: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| xAI | `xai.grok-4.7` | Grok 4.7 | TEXT+IMAGE > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| Z.AI | `zai.glm-4.7` | GLM 4.7 | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-north-1 eu-west-2 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Z.AI | `zai.glm-4.7-flash` | GLM 4.7 Flash | TEXT > TEXT | ACTIVE | Works, tools OK | 13: ap-south-1 ap-northeast-1 ap-southeast-2 eu-central-1 eu-north-1 eu-south-1 eu-west-2 eu-west-1 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Z.AI | `zai.glm-5` | GLM 5 | TEXT > TEXT | ACTIVE | Works, tools OK | 10: ap-south-1 ap-northeast-1 ap-southeast-2 eu-north-1 eu-west-2 ap-southeast-3 sa-east-1 us-east-1 us-east-2 us-west-2 |
| Z.AI | `zai.glm-5.3` | GLM 5.3 | TEXT > TEXT | ACTIVE | Denied (account) | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |

## Inference profiles (163)

| Profile ID | Name | Regions |
|---|---|---|
| `apac.amazon.nova-lite-v1:0` | APAC Nova Lite | 10: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ap-southeast-2 ap-southeast-7 ap-southeast-4 ap-southeast-3 |
| `apac.amazon.nova-micro-v1:0` | APAC Nova Micro | 9: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ap-southeast-2 ap-southeast-7 ap-southeast-3 |
| `apac.amazon.nova-pro-v1:0` | APAC Nova Pro | 10: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ap-southeast-2 ap-southeast-7 ap-southeast-4 ap-southeast-3 |
| `apac.anthropic.claude-3-5-sonnet-20240620-v1:0` | APAC Anthropic Claude 3.5 Sonnet | 5: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-southeast-2 |
| `apac.anthropic.claude-3-5-sonnet-20241022-v2:0` | APAC Anthropic Claude 3.5 Sonnet v2 | 7: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-southeast-2 |
| `apac.anthropic.claude-3-7-sonnet-20250219-v1:0` | APAC Anthropic Claude 3.7 Sonnet | 1: ap-south-1 |
| `apac.anthropic.claude-3-haiku-20240307-v1:0` | APAC Anthropic Claude 3 Haiku | 5: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-southeast-2 |
| `apac.anthropic.claude-3-sonnet-20240229-v1:0` | APAC Anthropic Claude 3 Sonnet | 5: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-southeast-2 |
| `apac.twelvelabs.marengo-embed-2-7-v1:0` | APAC TwelveLabs Marengo Embed v2.7 | 1: ap-northeast-2 |
| `apac.twelvelabs.pegasus-1-2-v1:0` | APAC Pegasus v1.2 | 1: ap-northeast-2 |
| `au.anthropic.claude-haiku-4-5-20251001-v1:0` | AU Anthropic Claude Haiku 4.5 | 3: ap-southeast-2 ap-southeast-4 ap-southeast-6 |
| `au.anthropic.claude-haiku-5-5` | AU Anthropic Claude Haiku 5.5 | 2: ap-southeast-2 ap-southeast-4 |
| `au.anthropic.claude-opus-4-6-v1` | AU Anthropic Claude Opus 4.6 | 3: ap-southeast-2 ap-southeast-4 ap-southeast-6 |
| `au.anthropic.claude-opus-4-7` | AU Anthropic Claude Opus 4.7 | 2: ap-southeast-2 ap-southeast-4 |
| `au.anthropic.claude-opus-4-8` | AU Anthropic Claude Opus 4.8 | 2: ap-southeast-2 ap-southeast-4 |
| `au.anthropic.claude-opus-5` | AU Anthropic Claude Opus 5 | 2: ap-southeast-2 ap-southeast-4 |
| `au.anthropic.claude-opus-5-5` | AU Anthropic Claude Opus 5.5 | 2: ap-southeast-2 ap-southeast-4 |
| `au.anthropic.claude-sonnet-4-5-20250929-v1:0` | AU AU Anthropic Claude Sonnet 4.5 | 3: ap-southeast-2 ap-southeast-4 ap-southeast-6 |
| `au.anthropic.claude-sonnet-4-6` | AU Anthropic Claude Sonnet 4.6 | 3: ap-southeast-2 ap-southeast-4 ap-southeast-6 |
| `au.anthropic.claude-sonnet-5` | AU Anthropic Claude Sonnet 5 | 2: ap-southeast-2 ap-southeast-4 |
| `au.anthropic.claude-sonnet-5-5` | AU Anthropic Claude Sonnet 5.5 | 2: ap-southeast-2 ap-southeast-4 |
| `ca.amazon.nova-lite-v1:0` | CA Nova Lite | 2: ca-central-1 ca-west-1 |
| `ca.anthropic.claude-haiku-5-5` | CA Anthropic Claude Haiku 5.5 | 2: ca-central-1 ca-west-1 |
| `eu.amazon.nova-2-lite-v1:0` | EU Amazon Nova 2 Lite | 6: eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-1 eu-west-3 |
| `eu.amazon.nova-lite-v1:0` | EU Nova Lite | 7: eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-1 il-central-1 eu-west-3 |
| `eu.amazon.nova-micro-v1:0` | EU Nova Micro | 7: eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-1 il-central-1 eu-west-3 |
| `eu.amazon.nova-pro-v1:0` | EU Nova Pro | 7: eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-1 il-central-1 eu-west-3 |
| `eu.anthropic.claude-3-haiku-20240307-v1:0` | EU Anthropic Claude 3 Haiku | 3: eu-central-1 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-3-sonnet-20240229-v1:0` | EU Anthropic Claude 3 Sonnet | 3: eu-central-1 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-haiku-4-5-20251001-v1:0` | EU Anthropic Claude Haiku 4.5 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-haiku-5-5` | EU Anthropic Claude Haiku 5.5 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-opus-4-5-20251101-v1:0` | EU Anthropic Claude Opus 4.5 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-opus-4-6-v1` | EU Anthropic Claude Opus 4.6 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-opus-4-7` | EU Anthropic Claude Opus 4.7 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-opus-4-8` | EU Anthropic Claude Opus 4.8 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-opus-5` | EU Anthropic Claude Opus 5 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-opus-5-5` | EU Anthropic Claude Opus 5.5 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` | EU Anthropic Claude Sonnet 4.5 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-sonnet-4-6` | EU Anthropic Claude Sonnet 4.6 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-sonnet-5` | EU Anthropic Claude Sonnet 5 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.anthropic.claude-sonnet-5-5` | EU Anthropic Claude Sonnet 5.5 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.cohere.embed-v4:0` | EU Cohere Embed v4 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `eu.meta.llama3-2-1b-instruct-v1:0` | EU Meta Llama 3.2 1B Instruct | 3: eu-central-1 eu-west-1 eu-west-3 |
| `eu.meta.llama3-2-3b-instruct-v1:0` | EU Meta Llama 3.2 3B Instruct | 3: eu-central-1 eu-west-1 eu-west-3 |
| `eu.mistral.pixtral-large-2502-v1:0` | EU Mistral Pixtral Large 25.02 | 4: eu-central-1 eu-north-1 eu-west-1 eu-west-3 |
| `eu.twelvelabs.marengo-embed-2-7-v1:0` | EU TwelveLabs Marengo Embed v2.7 | 1: eu-west-1 |
| `eu.twelvelabs.marengo-embed-3-0-v1:0` | EU TwelveLabs Marengo Embed 3.0 | 1: eu-west-1 |
| `eu.twelvelabs.pegasus-1-2-v1:0` | EU TwelveLabs Pegasus v1.2 | 8: eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 eu-west-3 |
| `global.amazon.nova-2-lite-v1:0` | GLOBAL Amazon Nova 2 Lite | 25: ap-southeast-1 ap-south-1 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-fable-5` | Global Anthropic Claude Fable 5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-fable-5-1` | Global Anthropic Claude Fable 5.1 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-haiku-4-5-20251001-v1:0` | Global Anthropic Claude Haiku 4.5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-haiku-5-5` | Global Anthropic Claude Haiku 5.5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-opus-4-5-20251101-v1:0` | GLOBAL Anthropic Claude Opus 4.5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-opus-4-6-v1` | Global Anthropic Claude Opus 4.6 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-opus-4-7` | Global Anthropic Claude Opus 4.7 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-opus-4-8` | Global Anthropic Claude Opus 4.8 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-opus-5` | Global Anthropic Claude Opus 5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-opus-5-5` | Global Anthropic Claude Opus 5.5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-sonnet-4-20250514-v1:0` | Global Claude Sonnet 4 | 4: ap-northeast-1 eu-west-1 us-east-2 us-west-2 |
| `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | Global Claude Sonnet 4.5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-sonnet-4-6` | Global Anthropic Claude Sonnet 4.6 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-sonnet-5` | Global Anthropic Claude Sonnet 5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.anthropic.claude-sonnet-5-5` | Global Anthropic Claude Sonnet 5.5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.cohere.embed-v4:0` | Global Cohere Embed v4 | 23: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ca-central-1 ap-southeast-2 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.moonshotai.kimi-k3` | Global Moonshot AI Kimi K3 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-5.4` | Global OpenAI GPT 5.4 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-5.5` | Global OpenAI GPT 5.5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-5.6-luna` | Global OpenAI GPT-5.6 Luna | 27: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-5.6-sol` | Global OpenAI GPT-5.6 Sol | 27: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-5.6-terra` | Global OpenAI GPT-5.6 Terra | 27: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-6-astra` | Global OpenAI GPT-6 Astra | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-6-luna` | Global OpenAI GPT-6 Luna | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-6-sol` | Global OpenAI GPT-6 Sol | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-6.1-sol` | Global OpenAI GPT-6.1 Sol | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.openai.gpt-6.1-terra` | Global OpenAI GPT-6.1 Terra | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.twelvelabs.pegasus-1-2-v1:0` | GLOBAL TwelveLabs Pegasus v1.2 | 30: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.twelvelabs.pegasus-1-5-v1:0` | Global TwelveLabs Pegasus v1.5 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.xai.grok-4.6` | Global xAI Grok 4.6 | 27: ap-south-2 ap-southeast-1 ap-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ap-southeast-7 ap-southeast-4 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.xai.grok-4.7` | Global xAI Grok 4.7 | 30: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `global.zai.glm-5.3` | Global Z.AI GLM 5.3 | 31: ap-south-2 ap-southeast-1 ap-south-1 af-south-1 ap-northeast-3 ap-northeast-2 ap-northeast-1 ap-east-2 ap-southeast-5 ca-central-1 ap-southeast-2 ca-west-1 ap-southeast-7 ap-southeast-4 ap-southeast-6 eu-central-2 eu-central-1 eu-north-1 eu-south-1 eu-south-2 eu-west-2 eu-west-1 ap-southeast-3 il-central-1 eu-west-3 mx-central-1 sa-east-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `in.anthropic.claude-haiku-4-5-20251001-v1:0` | IN Anthropic Claude Haiku 4.5 | 2: ap-south-2 ap-south-1 |
| `in.anthropic.claude-opus-5` | IN Anthropic Claude Opus 5 | 2: ap-south-2 ap-south-1 |
| `in.anthropic.claude-sonnet-5` | IN Anthropic Claude Sonnet 5 | 2: ap-south-2 ap-south-1 |
| `in.moonshotai.kimi-k3` | IN Moonshot AI Kimi K3 | 2: ap-south-2 ap-south-1 |
| `in.openai.gpt-5.6-luna` | IN OpenAI GPT-5.6 Luna | 2: ap-south-2 ap-south-1 |
| `in.openai.gpt-5.6-terra` | IN OpenAI GPT-5.6 Terra | 2: ap-south-2 ap-south-1 |
| `jp.amazon.nova-2-lite-v1:0` | JP Amazon Nova 2 Lite | 1: ap-northeast-1 |
| `jp.anthropic.claude-haiku-4-5-20251001-v1:0` | JP Anthropic Claude Haiku 4.5 | 2: ap-northeast-3 ap-northeast-1 |
| `jp.anthropic.claude-haiku-5-5` | JP Anthropic Claude Haiku 5.5 | 2: ap-northeast-3 ap-northeast-1 |
| `jp.anthropic.claude-opus-4-7` | JP Anthropic Claude Opus 4.7 | 2: ap-northeast-3 ap-northeast-1 |
| `jp.anthropic.claude-opus-4-8` | JP Anthropic Claude Opus 4.8 | 2: ap-northeast-3 ap-northeast-1 |
| `jp.anthropic.claude-opus-5-5` | JP Anthropic Claude Opus 5.5 | 2: ap-northeast-3 ap-northeast-1 |
| `jp.anthropic.claude-sonnet-4-5-20250929-v1:0` | JP Anthropic Claude Sonnet 4.5 | 2: ap-northeast-3 ap-northeast-1 |
| `jp.anthropic.claude-sonnet-4-6` | JP Anthropic Claude Sonnet 4.6 | 2: ap-northeast-3 ap-northeast-1 |
| `us.amazon.nova-2-lite-v1:0` | US Amazon Nova 2 Lite | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.amazon.nova-lite-v1:0` | US Nova Lite | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.amazon.nova-micro-v1:0` | US Nova Micro | 3: us-east-1 us-east-2 us-west-2 |
| `us.amazon.nova-premier-v1:0` | US Nova Premier | 3: us-east-1 us-east-2 us-west-2 |
| `us.amazon.nova-pro-v1:0` | US Nova Pro | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-3-haiku-20240307-v1:0` | US Anthropic Claude 3 Haiku | 3: us-east-1 us-east-2 us-west-2 |
| `us.anthropic.claude-3-sonnet-20240229-v1:0` | US Anthropic Claude 3 Sonnet | 2: us-east-1 us-west-2 |
| `us.anthropic.claude-fable-5` | US Anthropic Claude Fable 5 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-fable-5-1` | US Anthropic Claude Fable 5.1 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-haiku-4-5-20251001-v1:0` | US Anthropic Claude Haiku 4.5 | 5: ca-central-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-haiku-5-5` | US Anthropic Claude Haiku 5.5 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-opus-4-1-20250805-v1:0` | US Claude Opus 4.1 | 3: us-east-1 us-east-2 us-west-2 |
| `us.anthropic.claude-opus-4-5-20251101-v1:0` | US Anthropic Claude Opus 4.5 | 5: ca-central-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-opus-4-6-v1` | US Anthropic Claude Opus 4.6 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-opus-4-7` | US Anthropic Claude Opus 4.7 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-opus-4-8` | US Anthropic Claude Opus 4.8 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-opus-5` | US Anthropic Claude Opus 5 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-opus-5-5` | US Anthropic Claude Opus 5.5 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | US Anthropic Claude Sonnet 4.5 | 5: ca-central-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-sonnet-4-6` | US Anthropic Claude Sonnet 4.6 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-sonnet-5` | US Anthropic Claude Sonnet 5 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.anthropic.claude-sonnet-5-5` | US Anthropic Claude Sonnet 5.5 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.cohere.embed-v4:0` | US Cohere Embed v4 | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.deepseek.r1-v1:0` | US DeepSeek-R1 | 3: us-east-1 us-east-2 us-west-2 |
| `us.meta.llama3-1-405b-instruct-v1:0` | US Meta Llama 3.1 Instruct 405B | 1: us-east-2 |
| `us.meta.llama3-1-70b-instruct-v1:0` | US Meta Llama 3.1 70B Instruct | 3: us-east-1 us-east-2 us-west-2 |
| `us.meta.llama3-1-8b-instruct-v1:0` | US Meta Llama 3.1 8B Instruct | 3: us-east-1 us-east-2 us-west-2 |
| `us.meta.llama3-2-11b-instruct-v1:0` | US Meta Llama 3.2 11B Instruct | 3: us-east-1 us-east-2 us-west-2 |
| `us.meta.llama3-2-1b-instruct-v1:0` | US Meta Llama 3.2 1B Instruct | 3: us-east-1 us-east-2 us-west-2 |
| `us.meta.llama3-2-3b-instruct-v1:0` | US Meta Llama 3.2 3B Instruct | 3: us-east-1 us-east-2 us-west-2 |
| `us.meta.llama3-2-90b-instruct-v1:0` | US Meta Llama 3.2 90B Instruct | 3: us-east-1 us-east-2 us-west-2 |
| `us.meta.llama3-3-70b-instruct-v1:0` | US Meta Llama 3.3 70B Instruct | 3: us-east-1 us-east-2 us-west-2 |
| `us.meta.llama4-maverick-17b-instruct-v1:0` | US Llama 4 Maverick 17B Instruct | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.meta.llama4-scout-17b-instruct-v1:0` | US Llama 4 Scout 17B Instruct | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.mistral.pixtral-large-2502-v1:0` | US Mistral Pixtral Large 25.02 | 3: us-east-1 us-east-2 us-west-2 |
| `us.moonshotai.kimi-k3` | US Moonshot AI Kimi K3 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-5.4` | US OpenAI GPT 5.4 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-5.5` | US OpenAI GPT 5.5 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-5.6-luna` | US OpenAI GPT-5.6 Luna | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-5.6-sol` | US OpenAI GPT-5.6 Sol | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-5.6-terra` | US OpenAI GPT-5.6 Terra | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-6-astra` | US OpenAI GPT-6 Astra | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-6-luna` | US OpenAI GPT-6 Luna | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-6-sol` | US OpenAI GPT-6 Sol | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-6.1-sol` | US OpenAI GPT-6.1 Sol | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.openai.gpt-6.1-terra` | US OpenAI GPT-6.1 Terra | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.stability.stable-conservative-upscale-v1:0` | US Stable Image Conservative Upscale | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-creative-upscale-v1:0` | US Stable Image Creative Upscale | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-fast-upscale-v1:0` | US Stable Image Fast Upscale | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-image-control-sketch-v1:0` | US Stable Image Control Sketch | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-image-control-structure-v1:0` | US Stable Image Control Structure | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-image-erase-object-v1:0` | US Stable Image Erase Object | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-image-inpaint-v1:0` | US Stable Image Inpaint | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-image-remove-background-v1:0` | US Stable Image Remove Background | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-image-search-recolor-v1:0` | US Stable Image Search and Recolor | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-image-search-replace-v1:0` | US Stable Image Search and Replace | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-image-style-guide-v1:0` | US Stable Image Style Guide | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-outpaint-v1:0` | US Stable Image Outpaint | 3: us-east-1 us-east-2 us-west-2 |
| `us.stability.stable-style-transfer-v1:0` | US Stable Image Style Transfer | 3: us-east-1 us-east-2 us-west-2 |
| `us.twelvelabs.marengo-embed-2-7-v1:0` | US TwelveLabs Marengo Embed v2.7 | 1: us-east-1 |
| `us.twelvelabs.marengo-embed-3-0-v1:0` | US TwelveLabs Marengo Embed 3.0 | 1: us-east-1 |
| `us.twelvelabs.pegasus-1-2-v1:0` | US Pegasus v1.2 | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.twelvelabs.pegasus-1-5-v1:0` | US TwelveLabs Pegasus v1.5 | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.writer.palmyra-x4-v1:0` | US Writer Palmyra X4 | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.writer.palmyra-x5-v1:0` | US Writer Palmyra X5 | 4: us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.xai.grok-4.6` | US xAI Grok 4.6 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.xai.grok-4.7` | US xAI Grok 4.7 | 6: ca-central-1 ca-west-1 us-east-1 us-east-2 us-west-1 us-west-2 |
| `us.zai.glm-5.3` | US Z.AI GLM 5.3 | 4: us-east-1 us-east-2 us-west-1 us-west-2 |


# Wired into OpenCode and T3 Code

## Bedrock: passed a real OpenCode call (44)

Duplicate `global.` IDs removed in favour of `us.`. 3 run in us-west-2.

- `us.anthropic.claude-opus-4-6-v1`
- `us.anthropic.claude-sonnet-4-6`
- `us.moonshotai.kimi-k3`
- `global.anthropic.claude-haiku-4-5-20251001-v1:0`
- `global.anthropic.claude-opus-4-5-20251101-v1:0`
- `global.anthropic.claude-sonnet-4-5-20250929-v1:0`
- `us.anthropic.claude-opus-4-1-20250805-v1:0`
- `zai.glm-4.7`
- `qwen.qwen3-coder-480b-a35b-v1:0` (us-west-2)
- `qwen.qwen3-235b-a22b-2507-v1:0` (us-west-2)
- `deepseek.v3-v1:0` (us-west-2)
- `deepseek.v3.2`
- `mistral.devstral-2-123b`
- `google.gemma-3-12b-it`
- `google.gemma-3-27b-it`
- `google.gemma-3-4b-it`
- `zai.glm-4.7-flash`
- `zai.glm-5`
- `openai.gpt-oss-120b-1:0`
- `openai.gpt-oss-20b-1:0`
- `openai.gpt-oss-safeguard-120b`
- `openai.gpt-oss-safeguard-20b`
- `moonshot.kimi-k2-thinking`
- `moonshotai.kimi-k2.5`
- `mistral.magistral-small-2509`
- `minimax.minimax-m2`
- `minimax.minimax-m2.1`
- `minimax.minimax-m2.5`
- `mistral.ministral-3-14b-instruct`
- `mistral.ministral-3-3b-instruct`
- `mistral.ministral-3-8b-instruct`
- `mistral.mistral-large-3-675b-instruct`
- `nvidia.nemotron-nano-12b-v2`
- `nvidia.nemotron-nano-3-30b`
- `nvidia.nemotron-nano-9b-v2`
- `nvidia.nemotron-super-3-120b`
- `global.amazon.nova-2-lite-v1:0`
- `amazon.nova-lite-v1:0`
- `amazon.nova-micro-v1:0`
- `amazon.nova-pro-v1:0`
- `qwen.qwen3-coder-30b-a3b-v1:0`
- `qwen.qwen3-coder-next`
- `qwen.qwen3-next-80b-a3b`
- `qwen.qwen3-vl-235b-a22b`

## Bedrock: work through direct AWS calls, not in OpenCode (22)

These reject tools while streaming, refuse a system prompt, or have too little context for the agent prompt.

- `ai21.jamba-1-5-large-v1:0`
- `ai21.jamba-1-5-mini-v1:0`
- `mistral.mistral-large-2402-v1:0`
- `mistral.mistral-large-2407-v1:0`
- `mistral.mistral-small-2402-v1:0`
- `us.writer.palmyra-x4-v1:0`
- `us.writer.palmyra-x5-v1:0`
- `writer.palmyra-vision-7b`
- `meta.llama3-70b-instruct-v1:0`
- `meta.llama3-8b-instruct-v1:0`
- `us.deepseek.r1-v1:0`
- `us.meta.llama3-1-70b-instruct-v1:0`
- `us.meta.llama3-1-8b-instruct-v1:0`
- `us.meta.llama3-3-70b-instruct-v1:0`
- `us.meta.llama4-maverick-17b-instruct-v1:0`
- `us.meta.llama4-scout-17b-instruct-v1:0`
- `us.mistral.pixtral-large-2502-v1:0`
- `mistral.mistral-7b-instruct-v0:2`
- `mistral.mixtral-8x7b-instruct-v0:1`
- `mistral.voxtral-mini-3b-2507`
- `mistral.voxtral-small-24b-2507`
- `qwen.qwen3-32b-v1:0`

## Azure: deployed on terra-9f3bd647, swedencentral (14)

- `gpt-6.1-terra`
- `gpt-6-astra`
- `gpt-6.1-sol`
- `grok-4.6`
- `Kimi-K3.1-Pro`
- `MAI-Thinking-1`
- `FW-DeepSeek-V4.1-Flash-1017` (direct calls work; OpenCode fails because the 25k tokens-per-minute quota is below its roughly 36k prompt; hidden in T3)
- `gpt-6-sol`
- `gpt-6-luna`
- `grok-4.7`
- `Kimi-K2.7-Code` (direct calls work; OpenCode fails because the 20k tokens-per-minute quota is below its roughly 36k prompt; hidden in T3)
- `DeepSeek-V4-Pro-0813` (deployed, but direct calls return `Unknown model` and OpenCode hits the 20k rate limit; hidden in T3)
- `muse-spark-1.3` (direct calls work; OpenCode fails because the 20k tokens-per-minute quota is below its roughly 36k prompt; hidden in T3)
- `mistral-medium-3-5` (direct calls work; OpenCode fails because the 20k tokens-per-minute quota is below its roughly 36k prompt; hidden in T3)

## Azure: chat models in the swedencentral catalog, not deployed (90)

Listed by Azure. Not deployed or tested. Claude models need your industry, organization name and country code. MAI-Code-1.1-Flash needs a feature this subscription lacks. qwen3.8-27b has no deployable SKU.

- `claude-fable-5`
- `claude-fable-5-1`
- `claude-haiku-4-5`
- `claude-haiku-5-5`
- `claude-opus-4-5`
- `claude-opus-4-6`
- `claude-opus-4-7`
- `claude-opus-4-8`
- `claude-opus-5`
- `claude-opus-5-5`
- `claude-opus-5-5-fast`
- `claude-sonnet-4-5`
- `claude-sonnet-4-6`
- `claude-sonnet-5`
- `claude-sonnet-5-5`
- `Codestral-2501`
- `codex-mini`
- `cohere-command-a`
- `Cohere-command-a-plus-05-2026`
- `Cohere-rerank-v4.0-fast`
- `Cohere-rerank-v4.0-pro`
- `DeepSeek-R1`
- `DeepSeek-V3.2`
- `DeepSeek-V3.2-Speciale`
- `DeepSeek-V4-Flash`
- `DeepSeek-V4-Flash-0731`
- `DeepSeek-V4-Pro`
- `DeepSeek-V4.1-Flash`
- `DeepSeek-V4.1-Flash-1017`
- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4.1-nano`
- `gpt-4o`
- `gpt-4o-mini`
- `gpt-5`
- `gpt-5-codex`
- `gpt-5-mini`
- `gpt-5-nano`
- `gpt-5-pro`
- `gpt-5.1`
- `gpt-5.1-codex`
- `gpt-5.1-codex-max`
- `gpt-5.1-codex-mini`
- `gpt-5.2`
- `gpt-5.2-codex`
- `gpt-5.3-codex`
- `gpt-5.4`
- `gpt-5.4-mini`
- `gpt-5.4-nano`
- `gpt-5.4-pro`
- `gpt-5.5`
- `gpt-5.6-luna`
- `gpt-5.6-sol`
- `gpt-5.6-terra`
- `gpt-audio`
- `gpt-audio-1.5`
- `gpt-audio-mini`
- `gpt-chat-latest`
- `gpt-oss-120b`
- `gpt-oss-20b`
- `grok-4-1-fast-non-reasoning`
- `grok-4-1-fast-reasoning`
- `grok-4-20-non-reasoning`
- `grok-4-20-reasoning`
- `grok-4.3`
- `Kimi-K2.5`
- `Kimi-K2.6`
- `Llama-3.3-70B-Instruct`
- `Llama-4-Maverick-17B-128E-Instruct-FP8`
- `Llama-4-Scout-17B-16E-Instruct`
- `MAI-Code-1.1-Flash`
- `Ministral-3B`
- `Mistral-large`
- `Mistral-Large-3`
- `mistral-medium-2505`
- `mistral-small-2503`
- `model-router`
- `Muse-Glimmer-30B`
- `o1`
- `o3`
- `o3-mini`
- `o4-mini`
- `Phi-4`
- `Phi-4-mini-instruct`
- `Phi-4-mini-reasoning`
- `Phi-4-multimodal-instruct`
- `Phi-4-reasoning`
- `qwen3-32b`
- `qwen3.6-35b-a3b`
- `qwen3.8-27b`

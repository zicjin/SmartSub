"""SmartSub FireRedPunc JSONL sidecar.

Only this process imports torch/transformers. The Electron main process owns
resource checks, cancellation, and the public stage contract.
"""
import json
import sys
import traceback

_model = None
_cancelled = set()


def reply(request_id, result=None, error=None):
    message = {"id": request_id}
    if error:
        message["error"] = {"code": error[0], "message": error[1]}
    else:
        message["result"] = result
    sys.stdout.write(json.dumps(message, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def load_model(model_dir):
    global _model
    if _model is None:
        from fireredasr2s.fireredpunc.punc import FireRedPunc, FireRedPuncConfig
        _model = FireRedPunc.from_pretrained(
            model_dir, FireRedPuncConfig(use_gpu=False, sentence_max_length=-1)
        )
    return _model


def handle(request):
    method = request.get("method")
    request_id = request.get("id")
    params = request.get("params") or {}
    if method == "ping":
        reply(request_id, {"version": "firered-punc-1", "protocolVersion": 1})
    elif method == "load":
        load_model(params["model_dir"])
        reply(request_id, {"loaded": True})
    elif method == "punctuate":
        if request_id in _cancelled:
            _cancelled.discard(request_id)
            reply(request_id, error=("cancelled", "request cancelled"))
            return
        model = load_model(params["model_dir"])
        texts = params.get("texts")
        if not isinstance(texts, list) or not all(isinstance(x, str) for x in texts):
            reply(request_id, error=("invalid_input", "texts must be a string array"))
            return
        active = [text for text in texts if text.strip()]
        results = model.process(active) if active else []
        output = []
        result_index = 0
        for text in texts:
            if not text.strip():
                output.append("")
                continue
            result = results[result_index]
            result_index += 1
            if not isinstance(result, dict) or not isinstance(result.get("punc_text"), str):
                raise ValueError("FireRedPunc returned an invalid result")
            output.append(result["punc_text"])
        reply(request_id, {"texts": output})
    elif method == "cancel":
        if params.get("id"):
            _cancelled.add(params["id"])
    elif method == "shutdown":
        reply(request_id, {"stopped": True})
        raise SystemExit(0)
    else:
        reply(request_id, error=("unknown_method", str(method)))


for line in sys.stdin:
    try:
        if line.strip():
            handle(json.loads(line))
    except SystemExit:
        raise
    except Exception as exc:
        request_id = None
        try:
            request_id = json.loads(line).get("id")
        except Exception:
            pass
        reply(request_id, error=("runtime_error", f"{exc}"))
        traceback.print_exc(file=sys.stderr)

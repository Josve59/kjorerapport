D-FINE nano (COCO), ONNX fp32, from https://huggingface.co/onnx-community/dfine_n_coco-ONNX (onnx/model.onnx).
Original model: https://github.com/Peterande/D-FINE (Apache License 2.0), HF: ustc-community/dfine-nano-coco (apache-2.0).
Input pixel_values [1,3,640,640] (RGB 0–1, no normalisation). Outputs logits [1,300,80], pred_boxes [1,300,4] (cx,cy,w,h 0–1).

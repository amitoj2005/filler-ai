# TODO: CNN training pipeline
# - Pull completed games from Postgres
# - Convert move histories to (board_state, chosen_color) training pairs
# - Train a small CNN with PyTorch (input: board tensor, output: 6-class logits)
# - Export trained model to ../lib/ai/model.onnx via torch.onnx.export

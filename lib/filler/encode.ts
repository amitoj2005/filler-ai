// TODO: board → tensor encoding for neural network input
// - encodeBoardForNetwork(state, player): convert GameState to Float32Array
//   suitable for ONNX model input (e.g. one-hot color channels + territory masks)
// - Keep encoding logic here so training script and inference use the same format

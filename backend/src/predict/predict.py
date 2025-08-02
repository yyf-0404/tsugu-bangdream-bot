from tensorflow.keras.models import load_model
from tensorflow.keras.utils import custom_object_scope, register_keras_serializable
from tensorflow import math, reduce_mean, maximum
import numpy as np

from os import path
@register_keras_serializable()
def loss(y_true, y_pred):
    q = 0.5
    # err = math.exp(y_true) - math.exp(y_pred)
    err = y_true - y_pred
    return reduce_mean(maximum(q*err, (q-1)*err), axis=-1)
tierListOfServer = {
    3: [20, 30, 40, 50, 100, 200, 300, 400, 500, 1000, 2000, 3000, 4000, 5000, 10000, 20000, 30000, 50000, 70000, 100000]
}
server = 3
model = {}
for tier in tierListOfServer[server]:
    with custom_object_scope({'loss': loss}):
        model[tier] = load_model(path.join(path.join(path.dirname(path.abspath(__file__)), 'model'), f'ycx_{tier}_{server}.h5'))
def predict(inputs, tier):
    inputTensors = [np.array(input) for input in inputs]
    output = model[tier].predict(inputTensors)
    return output[0][0]
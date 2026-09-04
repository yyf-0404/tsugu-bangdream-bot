#include <node_api.h>
#include <malloc.h>

static napi_value trim(napi_env env, napi_callback_info info) {
    napi_value result;
    int released = malloc_trim(0);
    napi_get_boolean(env, released != 0, &result);
    return result;
}

NAPI_MODULE_INIT() {
    napi_value function;
    napi_create_function(env, "trim", NAPI_AUTO_LENGTH, trim, NULL, &function);
    napi_set_named_property(env, exports, "trim", function);
    return exports;
}

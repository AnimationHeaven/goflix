#include <jni.h>
#include <node.h>
#include <string>
#include <vector>

// JNI bridge between MainActivity.kt and Node's native entry point.
// Node itself does the real work (running the bundled server.cjs) —
// this file's only job is converting a Java String[] into the argv
// node::Start expects.
extern "C" JNIEXPORT jint JNICALL
Java_com_goflix_app_MainActivity_startNodeWithArguments(
        JNIEnv *env,
        jobject /* this */,
        jobjectArray arguments) {
    int argc = env->GetArrayLength(arguments);
    std::vector<std::string> args;
    std::vector<char *> argv;

    for (int i = 0; i < argc; ++i) {
        jstring arg = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *raw = env->GetStringUTFChars(arg, nullptr);
        args.emplace_back(raw);
        env->ReleaseStringUTFChars(arg, raw);
        env->DeleteLocalRef(arg);
    }

    for (auto &s : args) {
        argv.push_back(&s[0]);
    }

    return node::Start(static_cast<int>(argv.size()), argv.data());
}

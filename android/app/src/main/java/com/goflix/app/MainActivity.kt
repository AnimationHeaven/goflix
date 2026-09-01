package com.goflix.app

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private val port = 3001

    companion object {
        init {
            System.loadLibrary("native-lib")
            System.loadLibrary("node")
        }
    }

    external fun startNodeWithArguments(arguments: Array<String>): Int

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.databaseEnabled = true
        webView.webViewClient = WebViewClient()

        val nodeDir = File(filesDir, "nodejs-project")
        copyAssetFolder("nodejs-project", nodeDir)

        // Node only ever starts once per process — fine here since the
        // whole point of this Activity's lifetime is running the server.
        Thread {
            val mainJs = File(nodeDir, "server.cjs").absolutePath
            startNodeWithArguments(arrayOf("node", mainJs))
        }.start()

        waitForServerThenLoad()
    }

    /** Node needs a couple seconds to boot (guest token, etc.) — poll the
     * health endpoint instead of guessing a fixed delay. */
    private fun waitForServerThenLoad(attempt: Int = 0) {
        Thread {
            val reachable = try {
                val conn = URL("http://127.0.0.1:$port/api/health").openConnection() as HttpURLConnection
                conn.connectTimeout = 800
                conn.readTimeout = 800
                conn.responseCode == 200
            } catch (e: Exception) {
                false
            }

            Handler(Looper.getMainLooper()).post {
                if (reachable) {
                    webView.loadUrl("http://127.0.0.1:$port/")
                } else if (attempt < 60) {
                    Handler(Looper.getMainLooper()).postDelayed(
                        { waitForServerThenLoad(attempt + 1) },
                        500,
                    )
                }
            }
        }.start()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    private fun copyAssetFolder(assetPath: String, targetDir: File) {
        val list = assets.list(assetPath) ?: return
        if (list.isEmpty()) {
            copyAssetFile(assetPath, targetDir)
            return
        }
        targetDir.mkdirs()
        for (name in list) {
            copyAssetFolder("$assetPath/$name", File(targetDir, name))
        }
    }

    private fun copyAssetFile(assetPath: String, targetFile: File) {
        targetFile.parentFile?.mkdirs()
        var input: InputStream? = null
        var output: FileOutputStream? = null
        try {
            input = assets.open(assetPath)
            output = FileOutputStream(targetFile)
            input.copyTo(output)
        } finally {
            input?.close()
            output?.close()
        }
    }
}

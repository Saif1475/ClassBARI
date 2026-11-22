plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "app.classbari.classbari"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        applicationId = "app.classbari.classbari" // each app below has its own
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    // One codebase, five apps: flutter build apk --flavor student (or guardian, teacher, institute, chatbot).
    // The first four keep the ids of the earlier apps, so these can replace them as updates.
    flavorDimensions += "app"
    productFlavors {
        mapOf(
            "student" to "ClassBARI Student",
            "guardian" to "ClassBARI Guardian",
            "teacher" to "ClassBARI Teacher",
            "institute" to "ClassBARI Institution",
            "chatbot" to "ClassBARI AI",
        ).forEach { (app, label) ->
            create(app) {
                dimension = "app"
                applicationId = "app.classbari.$app"
                manifestPlaceholders["appName"] = label
                manifestPlaceholders["scheme"] = "classbari-$app" // Google sign-in comes back to classbari-<app>://auth
            }
        }
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

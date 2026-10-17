package com.yugraj.selfattendance;

import android.content.Intent;
import android.os.Bundle;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeGoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @CapacitorPlugin(name = "NativeGoogleAuth")
    public static class NativeGoogleAuthPlugin extends Plugin {
        private static final String DEFAULT_WEB_CLIENT_ID = "295288004499-qs61g8hbut4k22bb44hnp5mt7pgms5nu.apps.googleusercontent.com";

        private GoogleSignInClient getClient(PluginCall call) {
            String clientId = call.getString("serverClientId", DEFAULT_WEB_CLIENT_ID);
            GoogleSignInOptions gso = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(clientId)
                .requestEmail()
                .build();
            return GoogleSignIn.getClient(getActivity(), gso);
        }

        @PluginMethod
        public void signIn(PluginCall call) {
            GoogleSignInClient client = getClient(call);
            client.signOut().addOnCompleteListener(task -> {
                Intent signInIntent = client.getSignInIntent();
                startActivityForResult(call, signInIntent, "handleSignInResult");
            });
        }

        @ActivityCallback
        private void handleSignInResult(PluginCall call, ActivityResult result) {
            if (call == null) return;
            Intent data = result.getData();
            Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
            try {
                GoogleSignInAccount account = task.getResult(ApiException.class);
                String idToken = account != null ? account.getIdToken() : null;
                if (idToken == null || idToken.isEmpty()) {
                    call.reject("Google Sign-In did not return an ID token. Make sure your SHA-1 fingerprint is added in Firebase Console.");
                    return;
                }
                JSObject ret = new JSObject();
                ret.put("idToken", idToken);
                call.resolve(ret);
            } catch (ApiException e) {
                call.reject("Google Sign-In failed (code " + e.getStatusCode() + "). Ensure SHA-1 is added in Firebase Console.", e);
            }
        }

        @PluginMethod
        public void signOut(PluginCall call) {
            GoogleSignInClient client = getClient(call);
            client.signOut().addOnCompleteListener(task -> call.resolve());
        }
    }
}

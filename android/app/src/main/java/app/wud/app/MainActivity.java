package app.wud.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered BEFORE super.onCreate so Capacitor's
        // bridge sees them when it initialises the WebView. Adding the registry
        // call after super.onCreate is a documented gotcha that silently fails.
        registerPlugin(SavePhotoPlugin.class);
        registerPlugin(AddToCalendarPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

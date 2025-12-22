package com.forte.driver;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import android.content.Context;
import android.content.SharedPreferences;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // No custom plugin registration; using default BridgeActivity only
    }
}

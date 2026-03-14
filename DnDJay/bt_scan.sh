#!/usr/bin/env bash

{
    echo "scan on"
    sleep 10
    echo "scan off"
    echo "devices"
    echo "quit"
} | /usr/bin/bluetoothctl | 
/usr/bin/awk '
/^Device/ {
    mac = $2
    name = substr($0, index($0,$3))
    
    tmp = name
    gsub(/[:\-]/,"",tmp)
    tmp = tolower(tmp)
    if (tmp ~ /^[0-9a-f]{12}$/)
        next
        
    if (!(mac in seen)){
        seen[mac] = 1
        print mac, name
    }
}
'


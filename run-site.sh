#!/bin/sh

httpd -c $PWD/httpd.conf -f -p 8123 -h src

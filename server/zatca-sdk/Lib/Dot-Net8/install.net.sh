#!/bin/bash

export FATOORAH_HOME="${PWD}"
touch ~/.bash-profile
echo "export PATH=$PATH:$FATOORAH_HOME/Test/fatooraNet.exe" >> ~/.bashrc

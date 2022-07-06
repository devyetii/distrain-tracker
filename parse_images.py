import os
import csv
import cv2 as cv
import numpy as np

imagesFolder = input("Enter the path of the folder containing images: ")
isGray = input("Do you want to convert images to grayscale? (Y/N): ")
groundTruthFileName = input("Enter the path of the ground truth file (values should be numbers, one for each line): ")
outputFileName = input("Enter name of the output file: ")
groundTruth = open(groundTruthFileName, "r").read().split('\n')
rows = []

for imageName, Y in zip(os.listdir(imagesFolder), groundTruth):
    print("Processing image: " + imageName + " " + Y)
    img = cv.imread(imagesFolder + "/" + imageName, cv.IMREAD_COLOR if isGray == "N" else cv.IMREAD_GRAYSCALE)
    flattened = np.reshape(img, (1, -1))[0]
    flattened = np.append(flattened, int(Y))
    rows.append(flattened)

rows = np.array(rows, dtype=np.float32)
np.savetxt(outputFileName, rows, delimiter=",")
print("Done!")